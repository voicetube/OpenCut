import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { baseRateLimit } from "@/lib/rate-limit";
import { isTranscriptionConfigured } from "@/lib/transcription-utils";

const transcribeRequestSchema = z.object({
  audioUrl: z.string().url(),
  language: z
    .enum([
      "auto",
      "en",
      "zh",
      "es",
      "fr",
      "de",
      "it",
      "pt",
      "ru",
      "ja",
      "ko",
      "ar",
      "hi",
      "th",
      "vi",
      "nl",
      "tr",
      "pl",
      "sv",
      "da",
      "no",
      "fi",
      "uk",
      "cs",
      "hu",
    ])
    .default("auto"),
  echoingMode: z.boolean().default(false),
});

const apiResponseSchema = z.object({
  segments: z.array(
    z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    })
  ),
  language: z.string(),
  duration: z.number().optional(),
});

// Text processing functions adapted from whisper.py
function shouldMergeSegments(
  seg1: any,
  seg2: any,
  maxGap = 1.0,
  maxWords = 20,
  language = "en"
): boolean {
  const gap = seg2.start - seg1.end;

  if (gap > maxGap) {
    return false;
  }

  const text1 = seg1.word.trim();
  const text2 = seg2.word.trim();

  if (!text1 || !text2) {
    return false;
  }

  // For Japanese, be more conservative with merging
  if (language === "ja") {
    const combinedChars = text1.length + text2.length;
    if (combinedChars > 30) {
      return false;
    }

    const japaneseEndings = ["。", "！", "？", "…", "♪", "〜"];
    if (japaneseEndings.some((ending) => text1.endsWith(ending))) {
      return false;
    }

    if (gap > 0.3) {
      return false;
    }

    return true;
  }

  // English logic
  const combinedWords = (text1 + " " + text2).split(" ").length;
  if (combinedWords > maxWords) {
    return false;
  }

  // Don't merge if first segment ends with sentence-ending punctuation
  if (text1.endsWith("?") || text1.endsWith("!")) {
    return false;
  }

  if (text1.endsWith(".")) {
    if (gap > 0.5) {
      return false;
    }
    if (text2 && text2[0] && text2[0].toLowerCase() === text2[0]) {
      return true;
    }
    if (
      text2 &&
      ["And", "But", "So", "Or", "Yeah", "Yes", "No", "Okay"].includes(
        text2.split(" ")[0]
      )
    ) {
      return false;
    }
    return false;
  }

  return true;
}

function splitForEchoing(text: string, language = "en"): string[] {
  // For Asian languages, use character count
  if (["ja", "zh", "ko", "th"].includes(language)) {
    const MAX_CHARS = 15;
    const IDEAL_CHARS = 12;

    if (text.length <= IDEAL_CHARS) {
      return [text];
    }

    // Asian language break patterns
    const asianPatterns = [/[。！？]/, /、/, /，/];

    for (const pattern of asianPatterns) {
      const matches = Array.from(text.matchAll(new RegExp(pattern, "g")));
      if (matches.length > 0) {
        const targetPos = Math.floor(text.length / 2);
        const bestMatch = matches.reduce((prev, curr) =>
          Math.abs(curr.index! - targetPos) < Math.abs(prev.index! - targetPos)
            ? curr
            : prev
        );
        const splitPos = bestMatch.index! + bestMatch[0].length;

        const part1 = text.substring(0, splitPos).trim();
        const part2 = text.substring(splitPos).trim();

        if (part1 && part2) {
          return [
            ...splitForEchoing(part1, language),
            ...splitForEchoing(part2, language),
          ];
        }
      }
    }

    // If too long and no natural break, split at midpoint
    if (text.length > MAX_CHARS) {
      const midPoint = Math.floor(text.length / 2);
      const part1 = text.substring(0, midPoint).trim();
      const part2 = text.substring(midPoint).trim();
      return part1 && part2 ? [part1, part2] : [text];
    }

    return [text];
  }

  // English logic
  const MAX_WORDS = 7;
  const IDEAL_WORDS = 5;
  const words = text.split(" ");

  if (words.length <= IDEAL_WORDS) {
    return [text];
  }

  // Break at punctuation first
  const punctuationBreaks = [".", "!", "?", ";", ",", ":"];
  const segments: string[] = [];
  let currentSegment: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentSegment.push(word);

    // Check for punctuation breaks
    if (punctuationBreaks.some((punct) => word.endsWith(punct))) {
      if (currentSegment.length >= 2) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
        continue;
      }
    }

    // Force split at max words
    if (currentSegment.length >= MAX_WORDS) {
      segments.push(currentSegment.join(" "));
      currentSegment = [];
    }
  }

  // Add remaining words
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(" "));
  }

  return segments;
}

function createEchoingSegments(
  segmentsData: any[],
  wordsData: any[],
  language = "en"
): any[] {
  if (!segmentsData) return [];

  const initialSegments: any[] = [];

  for (const segment of segmentsData) {
    const text = segment.word.trim();
    if (!text) continue;

    const chunks = splitForEchoing(text, language);
    const segmentStart = segment.start;
    const segmentEnd = segment.end;
    const segmentDuration = segmentEnd - segmentStart;

    if (chunks.length === 1 && chunks[0] === text) {
      initialSegments.push({
        word: text,
        start: segmentStart,
        end: segmentEnd,
      });
    } else {
      let searchStart = segmentStart;
      const totalTextLength = text.length;

      for (const chunk of chunks) {
        const chunkProportion = chunk.length / totalTextLength;
        const chunkDuration = segmentDuration * chunkProportion;
        const chunkEnd = searchStart + chunkDuration;

        initialSegments.push({
          word: chunk,
          start: searchStart,
          end: chunkEnd,
        });
        searchStart = chunkEnd;
      }
    }
  }

  return initialSegments;
}

function createFinalizedSegments(
  segmentsData: any[],
  wordsData: any[],
  maxWords = 20,
  language = "en"
): any[] {
  if (!segmentsData) return [];

  // First pass: merge segments that should be together
  const mergedSegments: any[] = [];
  let currentSegment: any = null;

  for (const segment of segmentsData) {
    if (currentSegment === null) {
      currentSegment = { ...segment };
    } else if (
      shouldMergeSegments(currentSegment, segment, 1.0, maxWords, language)
    ) {
      currentSegment.word =
        currentSegment.word.trim() + " " + segment.word.trim();
      currentSegment.end = segment.end;
    } else {
      mergedSegments.push(currentSegment);
      currentSegment = { ...segment };
    }
  }

  if (currentSegment !== null) {
    mergedSegments.push(currentSegment);
  }

  // Second pass: split long segments if needed
  const finalSegments: any[] = [];

  for (const segment of mergedSegments) {
    const text = segment.word;
    const wordsCount = text.split(" ").length;

    if (language === "ja") {
      // For Japanese, check character count
      if (text.length > 30) {
        // Simple split at midpoint for now
        const midPoint = Math.floor(text.length / 2);
        const part1 = text.substring(0, midPoint).trim();
        const part2 = text.substring(midPoint).trim();

        if (part1 && part2) {
          const duration = segment.end - segment.start;
          const midTime = segment.start + duration / 2;

          finalSegments.push({
            word: part1,
            start: segment.start,
            end: midTime,
          });
          finalSegments.push({
            word: part2,
            start: midTime,
            end: segment.end,
          });
          continue;
        }
      }
    } else if (wordsCount > 18) {
      // Split long English segments
      const words = text.split(" ");
      const chunkSize = Math.ceil(words.length / 2);
      const part1 = words.slice(0, chunkSize).join(" ");
      const part2 = words.slice(chunkSize).join(" ");

      if (part1 && part2) {
        const duration = segment.end - segment.start;
        const midTime = segment.start + duration / 2;

        finalSegments.push({
          word: part1,
          start: segment.start,
          end: midTime,
        });
        finalSegments.push({
          word: part2,
          start: midTime,
          end: segment.end,
        });
        continue;
      }
    }

    finalSegments.push(segment);
  }

  return finalSegments;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
    const { success } = await baseRateLimit.limit(ip);

    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Check transcription configuration
    const transcriptionCheck = isTranscriptionConfigured();
    if (!transcriptionCheck.configured) {
      console.error(
        "Missing environment variables:",
        JSON.stringify(transcriptionCheck.missingVars)
      );

      return NextResponse.json(
        {
          error: "Transcription not configured",
          message: `Auto-captions require environment variables: ${transcriptionCheck.missingVars.join(", ")}. Check README for setup instructions.`,
        },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validationResult = transcribeRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request parameters",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { audioUrl, language, echoingMode } = validationResult.data;

    // Download audio file from R2
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(
        `Failed to download audio file: ${audioResponse.statusText}`
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([audioBuffer], "audio.wav", {
      type: "audio/wav",
    });

    // Prepare transcription parameters for OpenAI
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities", "segment");
    formData.append("timestamp_granularities", "word");

    if (language !== "auto") {
      formData.append("language", language);
    }

    // Call OpenAI Whisper API
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`);
    }

    const transcription = await openaiResponse.json();

    // Extract segments and words data
    const segmentsData =
      transcription.segments?.map((segment: any) => ({
        word: segment.text?.trim() || "",
        start: segment.start,
        end: segment.end,
      })) || [];

    const wordsData =
      transcription.words
        ?.filter((word: any) => word.word?.trim())
        .map((word: any) => ({
          word: word.word,
          start: word.start,
          end: word.end,
        })) || [];

    // Process segments based on mode and language
    let finalSegments;

    if (echoingMode) {
      finalSegments = createEchoingSegments(segmentsData, wordsData, language);
    } else if (["ja", "zh", "ko", "th"].includes(language)) {
      // Use original segments for Asian languages
      finalSegments = segmentsData;
    } else {
      finalSegments = createFinalizedSegments(
        segmentsData,
        wordsData,
        20,
        language
      );
    }

    // Filter out empty segments
    const filteredSegments = finalSegments.filter((segment) =>
      segment.word?.trim()
    );

    const responseData = {
      segments: filteredSegments,
      language: transcription.language,
      duration: transcription.duration,
    };

    const responseValidation = apiResponseSchema.safeParse(responseData);
    if (!responseValidation.success) {
      console.error(
        "Invalid API response structure:",
        responseValidation.error
      );
      return NextResponse.json(
        { error: "Internal response formatting error" },
        { status: 500 }
      );
    }

    return NextResponse.json(responseValidation.data);
  } catch (error) {
    console.error("Error in transcription:", error);
    return NextResponse.json(
      {
        error: "Transcription failed",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
