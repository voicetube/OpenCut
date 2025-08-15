import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, unlink, mkdtemp, rmdir } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { readFile } from "fs/promises";

interface TimelineElement {
  id: string;
  type: "media" | "text";
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  // Text-specific properties
  content?: string;
  fontSize?: number;
  color?: string;
  x?: number;
  y?: number;
  fontFamily?: string;
  backgroundColor?: string;
  // Media-specific properties
  mediaId?: string;
  mediaFileName?: string;
}

interface TimelineTrack {
  id: string;
  type: "media" | "text" | "audio";
  elements: TimelineElement[];
  muted?: boolean;
}

interface ExportOptions {
  format: "mp4" | "webm" | "mov";
  resolution: "original" | "1080p" | "720p" | "480p";
  frameRate: 24 | 30 | 60;
  quality: number;
}

interface ExportRequest {
  timeline: {
    tracks: TimelineTrack[];
    totalDuration: number;
  };
  options: ExportOptions;
  canvasSize: {
    width: number;
    height: number;
  };
}

// Helper to get output dimensions
function getOutputDimensions(resolution: string, canvasSize: { width: number; height: number }) {
  switch (resolution) {
    case "1080p": return { width: 1920, height: 1080 };
    case "720p": return { width: 1280, height: 720 };
    case "480p": return { width: 854, height: 480 };
    default: return canvasSize;
  }
}

// Generate ASS subtitle format
function generateASSSubtitles(textTracks: any[], width: number, height: number): string {
  // ASS header with style definitions
  const assHeader = `[Script Info]
Title: OpenCut Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  
  for (const track of textTracks) {
    for (const element of track.elements) {
      if (element.type === "text" && !element.hidden && element.content) {
        const startTime = element.startTime || 0;
        const endTime = startTime + (element.duration || 1);
        
        // Convert time to ASS format (h:mm:ss.cc)
        const formatASSTime = (seconds: number): string => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          const centisecs = Math.floor((seconds % 1) * 100);
          return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centisecs).padStart(2, '0')}`;
        };
        
        // Clean text for ASS format
        const text = element.content.replace(/\n/g, "\\N");
        
        events.push(
          `Dialogue: 0,${formatASSTime(startTime)},${formatASSTime(endTime)},Default,,0,0,0,,${text}`
        );
      }
    }
  }
  
  return assHeader + events.join("\n");
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  const tempFiles: string[] = [];

  try {
    // Parse the request
    const formData = await request.formData();
    const timelineData = formData.get("timeline") as string;
    const optionsData = formData.get("options") as string;
    const canvasSizeData = formData.get("canvasSize") as string;

    if (!timelineData || !optionsData || !canvasSizeData) {
      return NextResponse.json(
        { error: "Missing required data" },
        { status: 400 }
      );
    }

    const timeline = JSON.parse(timelineData);
    const options = JSON.parse(optionsData) as ExportOptions;
    const canvasSize = JSON.parse(canvasSizeData);

    // Create temporary directory for processing
    tempDir = await mkdtemp(path.join(tmpdir(), "opencut-export-"));
    
    // Save uploaded media files
    const mediaFiles = new Map<string, string>();
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("media_") && value instanceof File) {
        const mediaId = key.replace("media_", "");
        const buffer = Buffer.from(await value.arrayBuffer());
        const filePath = path.join(tempDir, value.name);
        await writeFile(filePath, buffer);
        mediaFiles.set(mediaId, filePath);
        tempFiles.push(filePath);
      }
    }

    // Get output dimensions
    const { width, height } = getOutputDimensions(options.resolution, canvasSize);

    // Build FFmpeg command
    const outputPath = path.join(tempDir, `output.${options.format}`);
    tempFiles.push(outputPath);

    // Collect all media and text elements
    const mediaElements: any[] = [];
    const textTracks: any[] = [];

    for (const track of timeline.tracks) {
      if (track.muted) continue;

      if (track.type === "text") {
        textTracks.push(track);
      }

      for (const element of track.elements) {
        if (element.type === "media" && element.mediaId) {
          const mediaPath = mediaFiles.get(element.mediaId);
          if (mediaPath) {
            mediaElements.push({
              ...element,
              path: mediaPath,
              track,
            });
          }
        }
      }
    }

    // Build FFmpeg arguments
    const ffmpegArgs: string[] = ["-y"];
    
    // Add input files
    const inputMap = new Map<string, number>();
    let inputIndex = 0;
    
    for (const element of mediaElements) {
      if (!inputMap.has(element.path)) {
        ffmpegArgs.push("-i", element.path);
        inputMap.set(element.path, inputIndex++);
      }
    }

    // Create filter complex for video
    let filterComplex = "";
    
    // Create base video (black background)
    filterComplex += `color=c=black:s=${width}x${height}:d=${timeline.totalDuration}:r=${options.frameRate}[base];`;
    
    // Process media elements
    let currentOverlay = "base";
    
    for (let i = 0; i < mediaElements.length; i++) {
      const element = mediaElements[i];
      const inputIdx = inputMap.get(element.path)!;
      const trimStart = element.trimStart || 0;
      const trimEnd = element.trimEnd || 0;
      const duration = element.duration - trimStart - trimEnd;
      
      // Trim and scale video
      filterComplex += `[${inputIdx}:v]trim=start=${trimStart}:duration=${duration},setpts=PTS-STARTPTS,`;
      filterComplex += `scale=${width}:${height}:force_original_aspect_ratio=decrease,`;
      filterComplex += `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[v${i}];`;
      
      // Overlay at the correct time
      const nextOverlay = `overlay${i}`;
      filterComplex += `[${currentOverlay}][v${i}]overlay=enable='between(t,${element.startTime},${element.startTime + duration})'[${nextOverlay}];`;
      currentOverlay = nextOverlay;
    }

    // If no media elements, use the base
    if (mediaElements.length === 0) {
      currentOverlay = "base";
    }

    // Add subtitles using ASS format if there are text elements
    let finalVideoStream = currentOverlay;
    if (textTracks.length > 0) {
      const assContent = generateASSSubtitles(textTracks, width, height);
      if (assContent) {
        const subtitlePath = path.join(tempDir, "subtitles.ass");
        await writeFile(subtitlePath, assContent);
        tempFiles.push(subtitlePath);
        
        // Use subtitles filter to burn in the ASS subtitles
        const subtitleStream = `${currentOverlay}_sub`;
        filterComplex += `[${currentOverlay}]ass=${subtitlePath}[${subtitleStream}];`;
        finalVideoStream = subtitleStream;
      }
    }

    // Remove trailing semicolon
    if (filterComplex.endsWith(";")) {
      filterComplex = filterComplex.slice(0, -1);
    }

    // Add filter complex to command
    if (filterComplex) {
      ffmpegArgs.push("-filter_complex", filterComplex);
      ffmpegArgs.push("-map", `[${finalVideoStream}]`);
    }

    // Add audio from first video if available
    if (mediaElements.length > 0) {
      ffmpegArgs.push("-map", "0:a?");
    }

    // Add codec settings
    const crf = Math.round(51 - (options.quality / 100) * 28);
    switch (options.format) {
      case "webm":
        ffmpegArgs.push("-c:v", "libvpx-vp9", "-crf", crf.toString(), "-b:v", "0", "-c:a", "libopus");
        break;
      case "mov":
        ffmpegArgs.push("-c:v", "prores_ks", "-profile:v", "2", "-c:a", "aac");
        break;
      default: // mp4
        ffmpegArgs.push("-c:v", "libx264", "-crf", crf.toString(), "-preset", "medium", "-c:a", "aac");
        break;
    }

    // Add duration and output
    ffmpegArgs.push("-t", timeline.totalDuration.toString());
    ffmpegArgs.push("-movflags", "+faststart");
    ffmpegArgs.push(outputPath);

    console.log("Executing FFmpeg with args:", ffmpegArgs);

    // Execute FFmpeg using spawn
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);
      
      let stderr = "";
      let stdout = "";
      
      ffmpeg.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      
      ffmpeg.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log("FFmpeg:", data.toString());
      });
      
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on("error", (err) => {
        reject(err);
      });
    });

    // Read the output file
    const videoData = await readFile(outputPath);

    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (e) {
        console.error("Failed to delete temp file:", file, e);
      }
    }

    if (tempDir) {
      try {
        await rmdir(tempDir);
      } catch (e) {
        console.error("Failed to delete temp dir:", tempDir, e);
      }
    }

    // Return the video file
    const mimeType =
      options.format === "webm"
        ? "video/webm"
        : options.format === "mov"
        ? "video/quicktime"
        : "video/mp4";

    return new NextResponse(videoData, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="export.${options.format}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);

    // Clean up on error
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (e) {}
    }

    if (tempDir) {
      try {
        await rmdir(tempDir);
      } catch (e) {}
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}