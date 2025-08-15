import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { useTimelineStore } from "@/stores/timeline-store";
import { useMediaStore } from "@/stores/media-store";
import { toast } from "sonner";

let ffmpeg: FFmpeg | null = null;

export const initFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  await ffmpeg.load(); // Use default config

  return ffmpeg;
};

export const generateThumbnail = async (
  videoFile: File,
  timeInSeconds = 1
): Promise<string> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "thumbnail.jpg";

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Generate thumbnail at specific time
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ss",
    timeInSeconds.toString(),
    "-vframes",
    "1",
    "-vf",
    "scale=320:240",
    "-q:v",
    "2",
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "image/jpeg" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return URL.createObjectURL(blob);
};

export const trimVideo = async (
  videoFile: File,
  startTime: number,
  endTime: number,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.mp4";

  // Set up progress callback
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  const duration = endTime - startTime;

  // Trim video
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ss",
    startTime.toString(),
    "-t",
    duration.toString(),
    "-c",
    "copy", // Use stream copy for faster processing
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "video/mp4" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};

export const getVideoInfo = async (
  videoFile: File
): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
}> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Capture FFmpeg stderr output with a one-time listener pattern
  let ffmpegOutput = "";
  let listening = true;
  const listener = (data: string) => {
    if (listening) ffmpegOutput += data;
  };
  ffmpeg.on("log", ({ message }) => listener(message));

  // Run ffmpeg to get info (stderr will contain the info)
  try {
    await ffmpeg.exec(["-i", inputName, "-f", "null", "-"]);
  } catch (error) {
    listening = false;
    await ffmpeg.deleteFile(inputName);
    console.error("FFmpeg execution failed:", error);
    throw new Error(
      "Failed to extract video info. The file may be corrupted or in an unsupported format."
    );
  }

  // Disable listener after exec completes
  listening = false;

  // Cleanup
  await ffmpeg.deleteFile(inputName);

  // Parse output for duration, resolution, and fps
  // Example: Duration: 00:00:10.00, start: 0.000000, bitrate: 1234 kb/s
  // Example: Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 90k tbn, 60 tbc

  const durationMatch = ffmpegOutput.match(/Duration: (\d+):(\d+):([\d.]+)/);
  let duration = 0;
  if (durationMatch) {
    const [, h, m, s] = durationMatch;
    duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
  }

  const videoStreamMatch = ffmpegOutput.match(
    /Video:.* (\d+)x(\d+)[^,]*, ([\d.]+) fps/
  );
  let width = 0,
    height = 0,
    fps = 0;
  if (videoStreamMatch) {
    width = parseInt(videoStreamMatch[1]);
    height = parseInt(videoStreamMatch[2]);
    fps = parseFloat(videoStreamMatch[3]);
  }

  return {
    duration,
    width,
    height,
    fps,
  };
};

export const convertToWebM = async (
  videoFile: File,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.webm";

  // Set up progress callback
  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Convert to WebM
  await ffmpeg.exec([
    "-i",
    inputName,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "30",
    "-b:v",
    "0",
    "-c:a",
    "libopus",
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "video/webm" });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};

export const extractAudio = async (
  videoFile: File,
  format: "mp3" | "wav" = "mp3"
): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();

  const inputName = "input.mp4";
  const outputName = `output.${format}`;

  // Write input file
  await ffmpeg.writeFile(
    inputName,
    new Uint8Array(await videoFile.arrayBuffer())
  );

  // Extract audio
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn", // Disable video
    "-acodec",
    format === "mp3" ? "libmp3lame" : "pcm_s16le",
    outputName,
  ]);

  // Read output file
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: `audio/${format}` });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return blob;
};

export const extractTimelineAudio = async (
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  // Create fresh FFmpeg instance for this operation
  const ffmpeg = new FFmpeg();

  try {
    await ffmpeg.load();
  } catch (error) {
    console.error("Failed to load fresh FFmpeg instance:", error);
    throw new Error("Unable to initialize audio processing. Please try again.");
  }

  const timeline = useTimelineStore.getState();
  const mediaStore = useMediaStore.getState();

  const tracks = timeline.tracks;
  const totalDuration = timeline.getTotalDuration();

  if (totalDuration === 0) {
    const emptyAudioData = new ArrayBuffer(44);
    return new Blob([emptyAudioData], { type: "audio/wav" });
  }

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  const audioElements: Array<{
    file: File;
    startTime: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
    trackMuted: boolean;
  }> = [];

  for (const track of tracks) {
    if (track.muted) continue;

    for (const element of track.elements) {
      if (element.type === "media") {
        const mediaItem = mediaStore.mediaItems.find(
          (m) => m.id === element.mediaId
        );
        if (!mediaItem) continue;

        if (mediaItem.type === "video" || mediaItem.type === "audio") {
          audioElements.push({
            file: mediaItem.file,
            startTime: element.startTime,
            duration: element.duration,
            trimStart: element.trimStart,
            trimEnd: element.trimEnd,
            trackMuted: track.muted || false,
          });
        }
      }
    }
  }

  if (audioElements.length === 0) {
    // Return silent audio if no audio elements
    const silentDuration = Math.max(1, totalDuration); // At least 1 second
    try {
      const silentAudio = await generateSilentAudio(silentDuration);
      return silentAudio;
    } catch (error) {
      console.error("Failed to generate silent audio:", error);
      throw new Error("Unable to generate audio for empty timeline.");
    }
  }

  // Create a complex filter to mix all audio sources
  const inputFiles: string[] = [];
  const filterInputs: string[] = [];

  try {
    for (let i = 0; i < audioElements.length; i++) {
      const element = audioElements[i];
      const inputName = `input_${i}.${element.file.name.split(".").pop()}`;
      inputFiles.push(inputName);

      try {
        await ffmpeg.writeFile(
          inputName,
          new Uint8Array(await element.file.arrayBuffer())
        );
      } catch (error) {
        console.error(`Failed to write file ${element.file.name}:`, error);
        throw new Error(
          `Unable to process file: ${element.file.name}. The file may be corrupted or in an unsupported format.`
        );
      }

      const actualStart = element.trimStart;
      const actualDuration =
        element.duration - element.trimStart - element.trimEnd;

      const filterName = `audio_${i}`;
      filterInputs.push(
        `[${i}:a]atrim=start=${actualStart}:duration=${actualDuration},asetpts=PTS-STARTPTS,adelay=${element.startTime * 1000}|${element.startTime * 1000}[${filterName}]`
      );
    }

    const mixFilter =
      audioElements.length === 1
        ? `[audio_0]aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[out]`
        : `${filterInputs.map((_, i) => `[audio_${i}]`).join("")}amix=inputs=${audioElements.length}:duration=longest:dropout_transition=2,aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[out]`;

    const complexFilter = [...filterInputs, mixFilter].join(";");
    const outputName = "timeline_audio.wav";

    const ffmpegArgs = [
      ...inputFiles.flatMap((name) => ["-i", name]),
      "-filter_complex",
      complexFilter,
      "-map",
      "[out]",
      "-t",
      totalDuration.toString(),
      "-c:a",
      "pcm_s16le",
      "-ar",
      "44100",
      outputName,
    ];

    try {
      await ffmpeg.exec(ffmpegArgs);
    } catch (error) {
      console.error("FFmpeg execution failed:", error);
      throw new Error(
        "Audio processing failed. Some audio files may be corrupted or incompatible."
      );
    }

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: "audio/wav" });

    return blob;
  } catch (error) {
    for (const inputFile of inputFiles) {
      try {
        await ffmpeg.deleteFile(inputFile);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup file ${inputFile}:`, cleanupError);
      }
    }
    try {
      await ffmpeg.deleteFile("timeline_audio.wav");
    } catch (cleanupError) {
      console.warn("Failed to cleanup output file:", cleanupError);
    }

    throw error;
  } finally {
    for (const inputFile of inputFiles) {
      try {
        await ffmpeg.deleteFile(inputFile);
      } catch (cleanupError) {}
    }
    try {
      await ffmpeg.deleteFile("timeline_audio.wav");
    } catch (cleanupError) {}
  }
};

const generateSilentAudio = async (durationSeconds: number): Promise<Blob> => {
  const ffmpeg = await initFFmpeg();
  const outputName = "silent.wav";

  try {
    await ffmpeg.exec([
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-t",
      durationSeconds.toString(),
      "-c:a",
      "pcm_s16le",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: "audio/wav" });

    return blob;
  } catch (error) {
    console.error("Failed to generate silent audio:", error);
    throw error;
  } finally {
    try {
      await ffmpeg.deleteFile(outputName);
    } catch (cleanupError) {
      // Silent cleanup
    }
  }
};

export interface RenderOptions {
  format: "mp4" | "webm" | "mov";
  resolution: "original" | "1080p" | "720p" | "480p";
  frameRate: 24 | 30 | 60;
  quality: number; // 1-100
  onProgress?: (progress: number) => void;
}

// Generate WebVTT subtitle format (simpler than ASS)
function generateWebVTTSubtitles(textTracks: any[]): string {
  let vttContent = "WEBVTT\n\n";
  
  for (const track of textTracks) {
    for (const element of track.elements) {
      if (element.type === "text" && !element.hidden && element.content) {
        const startTime = element.startTime || 0;
        const endTime = startTime + (element.duration || 1);
        
        // Convert time to VTT format (HH:MM:SS.mmm)
        const formatVTTTime = (seconds: number): string => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          const millis = Math.floor((seconds % 1) * 1000);
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
        };
        
        vttContent += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n`;
        vttContent += `${element.content}\n\n`;
      }
    }
  }
  
  return vttContent;
}

// Generate ASS (Advanced SubStation Alpha) subtitle format
function generateASSSubtitles(textTracks: any[], videoWidth: number, videoHeight: number): string {
  // ASS header with style definitions
  const assHeader = `[Script Info]
Title: OpenCut Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,50,1

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
        
        // Escape text for ASS format
        const escapedText = element.content
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\N");
        
        // Calculate position if element has custom x/y
        let positionTag = "";
        if (element.x !== undefined || element.y !== undefined) {
          const x = Math.round((videoWidth / 2) + (element.x || 0));
          const y = Math.round((videoHeight / 2) + (element.y || 0));
          positionTag = `{\\pos(${x},${y})}`;
        }
        
        // Add color override if element has custom color
        let colorTag = "";
        if (element.color && element.color !== "#ffffff") {
          // Convert hex to ASS color format (&HBBGGRR)
          const hex = element.color.replace("#", "");
          const r = hex.substring(0, 2);
          const g = hex.substring(2, 4);
          const b = hex.substring(4, 6);
          colorTag = `{\\c&H${b}${g}${r}&}`;
        }
        
        // Add font size override if different from default
        let sizeTag = "";
        if (element.fontSize && element.fontSize !== 48) {
          sizeTag = `{\\fs${element.fontSize}}`;
        }
        
        const tags = positionTag + colorTag + sizeTag;
        const text = tags + escapedText;
        
        events.push(
          `Dialogue: 0,${formatASSTime(startTime)},${formatASSTime(endTime)},Default,,0,0,0,,${text}`
        );
      }
    }
  }
  
  if (events.length === 0) {
    return "";
  }
  
  return assHeader + events.join("\n");
}

export const renderTimelineVideo = async (
  options: RenderOptions
): Promise<Blob> => {
  console.log("Starting video render with options:", options);
  
  // Create fresh FFmpeg instance for rendering
  const ffmpeg = new FFmpeg();
  
  try {
    await ffmpeg.load();
  } catch (error) {
    console.error("Failed to load FFmpeg for rendering:", error);
    throw new Error("Unable to initialize video rendering. Please try again.");
  }

  const timeline = useTimelineStore.getState();
  const mediaStore = useMediaStore.getState();
  
  const tracks = timeline.tracks;
  const totalDuration = timeline.getTotalDuration();
  
  if (totalDuration === 0) {
    throw new Error("Timeline is empty. Add some content before exporting.");
  }

  if (options.onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      options.onProgress!(progress * 100);
    });
  }

  // Determine output dimensions
  const getOutputDimensions = () => {
    switch (options.resolution) {
      case "1080p": return { width: 1920, height: 1080 };
      case "720p": return { width: 1280, height: 720 };
      case "480p": return { width: 854, height: 480 };
      case "original": 
      default:
        // Find the largest video dimensions in the timeline
        let maxWidth = 1920;
        let maxHeight = 1080;
        
        for (const track of tracks) {
          if (track.type === "media" && !track.muted) {
            for (const element of track.elements) {
              if (element.type === "media") {
                const mediaItem = mediaStore.mediaItems.find(
                  (m) => m.id === element.mediaId
                );
                if (mediaItem && mediaItem.type === "video") {
                  maxWidth = Math.max(maxWidth, mediaItem.width || 1920);
                  maxHeight = Math.max(maxHeight, mediaItem.height || 1080);
                }
              }
            }
          }
        }
        
        return { width: maxWidth, height: maxHeight };
    }
  };

  const { width, height } = getOutputDimensions();
  const inputFiles: string[] = [];
  const filterComplexParts: string[] = [];
  
  try {
    // First, collect all media elements
    const mediaElements: Array<{
      element: any;
      track: any;
      inputIndex: number;
      inputName: string;
    }> = [];
    
    let inputIndex = 0;
    
    // Process media tracks (video/images)
    for (const track of tracks) {
      if (track.type === "media" && !track.muted) {
        for (const element of track.elements) {
          if (element.type === "media" && !element.hidden) {
            const mediaItem = mediaStore.mediaItems.find(
              (m) => m.id === element.mediaId
            );
            
            if (!mediaItem || mediaItem.type === "audio") continue;
            
            const inputName = `input_${inputIndex}.${mediaItem.file.name.split(".").pop()}`;
            inputFiles.push(inputName);
            
            await ffmpeg.writeFile(
              inputName,
              new Uint8Array(await mediaItem.file.arrayBuffer())
            );
            
            mediaElements.push({
              element,
              track,
              inputIndex,
              inputName,
            });
            
            inputIndex++;
          }
        }
      }
    }
    
    // Create background (black video for the full duration)
    filterComplexParts.push(
      `color=c=black:s=${width}x${height}:d=${totalDuration}:r=${options.frameRate}[base]`
    );
    
    // Process each media element and overlay it
    let currentOverlay = "base";
    
    for (let i = 0; i < mediaElements.length; i++) {
      const { element, inputIndex } = mediaElements[i];
      const actualStart = element.trimStart;
      const actualDuration = element.duration - element.trimStart - element.trimEnd;
      
      // Trim and scale the input
      const trimmedLabel = `trimmed${i}`;
      filterComplexParts.push(
        `[${inputIndex}:v]trim=start=${actualStart}:duration=${actualDuration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[${trimmedLabel}]`
      );
      
      // Overlay at the correct time
      const overlayLabel = i === mediaElements.length - 1 ? "video" : `overlay${i}`;
      filterComplexParts.push(
        `[${currentOverlay}][${trimmedLabel}]overlay=enable='between(t,${element.startTime},${element.startTime + actualDuration})'[${overlayLabel}]`
      );
      
      currentOverlay = overlayLabel;
    }
    
    // If no media elements, use the base as video
    if (mediaElements.length === 0) {
      filterComplexParts.push("[base]copy[video]");
    }
    
    // Handle text overlays - try multiple approaches
    const textTracks = tracks.filter(t => t.type === "text" && !t.muted);
    let videoStream = currentOverlay === "base" && mediaElements.length === 0 ? "base" : 
                     mediaElements.length === 0 ? "video" : currentOverlay;
    
    console.log(`Processing ${textTracks.length} text tracks`);
    
    // Use the simplest possible approach - just add the first caption as a test
    if (textTracks.length > 0) {
      try {
        // Find the first text element
        let firstText = null;
        for (const track of textTracks) {
          for (const element of track.elements) {
            if (element.type === "text" && !element.hidden && element.content) {
              firstText = {
                content: element.content.replace(/'/g, "").replace(/:/g, " ").replace(/\\/g, ""),
                start: element.startTime || 0,
                end: (element.startTime || 0) + (element.duration || 1)
              };
              break;
            }
          }
          if (firstText) break;
        }
        
        if (firstText) {
          // Try the absolute simplest drawtext command
          const subtitleStream = `${videoStream}_text`;
          const simpleFilter = `[${videoStream}]drawtext=text='TEST CAPTION':fontcolor=white:fontsize=48:x=100:y=100[${subtitleStream}]`;
          
          filterComplexParts.push(simpleFilter);
          videoStream = subtitleStream;
          console.log("Simple test caption added");
        }
      } catch (error) {
        console.error("Failed to add text overlay:", error);
        
        // Fallback: Try WebVTT subtitles
        try {
          const vttContent = generateWebVTTSubtitles(textTracks);
          if (vttContent) {
            await ffmpeg.writeFile("subtitles.vtt", new TextEncoder().encode(vttContent));
            console.log("WebVTT subtitles file created as fallback");
            
            const subtitleStream = `${videoStream}_sub`;
            filterComplexParts.push(
              `[${videoStream}]subtitles=subtitles.vtt:force_style='Fontsize=24'[${subtitleStream}]`
            );
            videoStream = subtitleStream;
          }
        } catch (vttError) {
          console.error("WebVTT fallback also failed:", vttError);
          console.log("Continuing without captions");
        }
      }
    }
    
    // Final video stream
    const finalVideoStream = videoStream;
    
    // Extract audio
    console.log("Extracting timeline audio...");
    let audioBlob;
    try {
      audioBlob = await extractTimelineAudio();
      console.log("Audio extracted successfully, size:", audioBlob.size);
    } catch (error) {
      console.error("Failed to extract audio:", error);
      // Create silent audio as fallback
      audioBlob = await generateSilentAudio(totalDuration);
    }
    
    try {
      await ffmpeg.writeFile("audio.wav", new Uint8Array(await audioBlob.arrayBuffer()));
      console.log("Audio file written to FFmpeg filesystem");
    } catch (error) {
      console.error("Failed to write audio file:", error);
      throw new Error("Failed to prepare audio for export");
    }
    
    // Combine filter complex
    const filterComplex = filterComplexParts.join(";");
    console.log("Filter complex:", filterComplex);
    
    // Determine codec settings based on format
    const getCodecSettings = () => {
      const crf = Math.round(51 - (options.quality / 100) * 28); // CRF 23-51 range
      
      switch (options.format) {
        case "webm":
          return ["-c:v", "libvpx-vp9", "-crf", crf.toString(), "-b:v", "0"];
        case "mov":
          return ["-c:v", "prores_ks", "-profile:v", "2"];
        case "mp4":
        default:
          return ["-c:v", "libx264", "-crf", crf.toString(), "-preset", "medium"];
      }
    };
    
    const codecSettings = getCodecSettings();
    const outputName = `output.${options.format}`;
    
    // Build FFmpeg command
    const ffmpegArgs = [
      ...inputFiles.flatMap((name) => ["-i", name]),
      "-i", "audio.wav",
      "-filter_complex", filterComplex,
      "-map", `[${finalVideoStream}]`,
      "-map", `${inputFiles.length}:a`,
      ...codecSettings,
      "-c:a", options.format === "webm" ? "libopus" : "aac",
      "-r", options.frameRate.toString(),
      "-t", totalDuration.toString(),
      "-movflags", "+faststart",
      outputName,
    ];
    
    console.log("FFmpeg command:", ffmpegArgs);
    
    try {
      await ffmpeg.exec(ffmpegArgs);
      console.log("FFmpeg execution completed");
    } catch (error) {
      console.error("FFmpeg execution failed:", error);
      throw new Error("Failed to render video. Please check your timeline content.");
    }
    
    // Try to read the output file
    let data;
    try {
      console.log(`Attempting to read output file: ${outputName}`);
      data = await ffmpeg.readFile(outputName);
      console.log(`Output file read successfully, size: ${data.length} bytes`);
    } catch (error) {
      console.error("Failed to read output file:", error);
      
      // Try without text overlays as fallback
      console.log("Retrying export without text overlays...");
      
      // Rebuild command without text filters
      const simpleFilterComplex = mediaElements.length === 0 
        ? "color=c=black:s=" + width + "x" + height + ":d=" + totalDuration + ":r=" + options.frameRate + "[video]"
        : filterComplexParts.slice(0, mediaElements.length * 2 + 1).join(";");
      
      const simpleVideoStream = mediaElements.length === 0 ? "video" : currentOverlay;
      
      const simpleFfmpegArgs = [
        ...inputFiles.flatMap((name) => ["-i", name]),
        "-i", "audio.wav",
        "-filter_complex", simpleFilterComplex,
        "-map", `[${simpleVideoStream}]`,
        "-map", `${inputFiles.length}:a`,
        ...codecSettings,
        "-c:a", options.format === "webm" ? "libopus" : "aac",
        "-r", options.frameRate.toString(),
        "-t", totalDuration.toString(),
        outputName,
      ];
      
      console.log("Simplified FFmpeg command:", simpleFfmpegArgs);
      
      try {
        await ffmpeg.exec(simpleFfmpegArgs);
        data = await ffmpeg.readFile(outputName);
        console.log("Fallback export succeeded, size:", data.length);
        toast.warning("Exported without captions due to technical limitations");
      } catch (fallbackError) {
        console.error("Fallback export also failed:", fallbackError);
        throw new Error("Unable to export video. Please try with simpler content.");
      }
    }
    
    const mimeType = 
      options.format === "webm" ? "video/webm" : 
      options.format === "mov" ? "video/quicktime" :
      "video/mp4";
    
    const blob = new Blob([data], { type: mimeType });
    
    return blob;
  } catch (error) {
    console.error("Video rendering failed:", error);
    throw error;
  } finally {
    // Cleanup
    for (const inputFile of inputFiles) {
      try {
        await ffmpeg.deleteFile(inputFile);
      } catch (cleanupError) {}
    }
    try {
      await ffmpeg.deleteFile("audio.wav");
      await ffmpeg.deleteFile(`output.${options.format}`);
    } catch (cleanupError) {}
  }
};
