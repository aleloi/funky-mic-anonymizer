import { useState, useRef, useEffect } from 'react';
import { AudioProcessor } from '@/lib/audioProcessor';
import { Glasses, Mic, Download, MicOff, Play, Square } from 'lucide-react';
import { VoiceSettings, VoiceSettings as VoiceSettingsType, defaultVoiceSettings } from "@/components/VoiceSettings";

const audioProcessor = new AudioProcessor();

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsType>(defaultVoiceSettings);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [audioData, setAudioData] = useState<number[]>(new Array(50).fill(0));

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const analyseAudio = () => {
      if (!analyserRef.current) return new Array(50).fill(0);
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Get average levels for different frequency ranges
      const bands = 50;
      const levelData = new Array(bands).fill(0);
      const samplesPerBand = Math.floor(dataArray.length / bands);
      
      for (let i = 0; i < bands; i++) {
        let sum = 0;
        for (let j = 0; j < samplesPerBand; j++) {
          sum += dataArray[i * samplesPerBand + j];
        }
        levelData[i] = sum / samplesPerBand / 255.0;
      }
      
      return levelData;
    };

    const drawWaveform = (timestamp: number) => {
      ctx.fillStyle = '#1A1F2C';
      ctx.fillRect(0, 0, width, height);

      const levels = isRecording || isPlaying ? analyseAudio() : new Array(50).fill(0);
      setAudioData(levels);

      // Draw frequency-based waveform
      ctx.beginPath();
      ctx.strokeStyle = '#9b87f5';
      ctx.lineWidth = 2;

      const spacing = width / levels.length;

      for (let i = 0; i < levels.length; i++) {
        const x = i * spacing;
        // Combine frequency data with a sine wave for visual interest
        const freqAmplitude = levels[i] * 40;
        const sineAmplitude = Math.sin(timestamp / 1000 + i * 0.2) * 10;
        const y = height / 2 + (freqAmplitude + sineAmplitude) * (isRecording || isPlaying ? 1 : 0.2);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      // Add glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#9b87f5';
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    };

    animationFrameRef.current = requestAnimationFrame(drawWaveform);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, isPlaying]);

  const handleRecord = async () => {
    if (isRecording) {
      setIsProcessing(true);
      const audioBlob = await audioProcessor.stopRecording();
      const anonymizedBlob = await audioProcessor.anonymizeAudio(audioBlob, voiceSettings);
      setProcessedBlob(anonymizedBlob);
      setIsRecording(false);
      setIsProcessing(false);
      
      audioElementRef.current = await audioProcessor.createAudioElement(anonymizedBlob);
      analyserRef.current = null;
    } else {
      await audioProcessor.startRecording();
      analyserRef.current = audioProcessor.getAnalyser();
      setIsRecording(true);
      setProcessedBlob(null);
    }
  };

  const handlePlayback = () => {
    if (!audioElementRef.current) return;
    
    if (isPlaying) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioElementRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (processedBlob && downloadLinkRef.current) {
      const url = URL.createObjectURL(processedBlob);
      downloadLinkRef.current.href = url;
      downloadLinkRef.current.download = 'anonymized-audio.wav';
      downloadLinkRef.current.click();
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
    }
  }, [processedBlob]);

  return (
    <div className="min-h-screen bg-[#1A1F2C] text-white font-mono">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center space-y-8">
          <div className="relative">
            <Glasses 
              size={120} 
              className="text-[#9b87f5] animate-pulse" 
              strokeWidth={1.5} 
            />
            <div className="absolute inset-0 blur-xl bg-[#9b87f5] opacity-20" />
          </div>
          
          <h1 className="text-4xl font-bold text-center mb-2">
            Voice Anonymizer
          </h1>
          <p className="text-gray-400 text-center max-w-md">
            Record your voice and transform it into an anonymized version using spectral inversion.
          </p>

          <div className="w-full max-w-2xl h-32 relative">
            <canvas 
              ref={canvasRef}
              width={800}
              height={128}
              className="w-full h-full"
            />
          </div>

          <div className="w-full max-w-md">
            <VoiceSettings 
              settings={voiceSettings}
              onChange={setVoiceSettings}
            />
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-[#9b87f5] blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
            <button
              onClick={handleRecord}
              disabled={isProcessing}
              className={`
                relative px-8 py-4 rounded-lg bg-black/30 
                backdrop-blur-md border border-[#9b87f5]/30
                hover:border-[#9b87f5] transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isRecording ? 'animate-pulse' : ''}
              `}
            >
              <div className="flex items-center space-x-2">
                {isRecording ? (
                  <MicOff className="w-6 h-6 text-red-500" />
                ) : (
                  <Mic className="w-6 h-6 text-[#9b87f5]" />
                )}
                <span>
                  {isProcessing 
                    ? 'Processing...' 
                    : isRecording 
                    ? 'Stop Recording' 
                    : 'Start Recording'}
                </span>
              </div>
            </button>
          </div>

          {processedBlob && (
            <div className="flex space-x-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-[#7af5f5] blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                <button
                  onClick={handlePlayback}
                  className="
                    relative px-8 py-4 rounded-lg bg-black/30 
                    backdrop-blur-md border border-[#7af5f5]/30
                    hover:border-[#7af5f5] transition-all
                    flex items-center space-x-2
                  "
                >
                  {isPlaying ? (
                    <Square className="w-6 h-6 text-[#7af5f5]" />
                  ) : (
                    <Play className="w-6 h-6 text-[#7af5f5]" />
                  )}
                  <span>{isPlaying ? 'Stop' : 'Play'}</span>
                </button>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-[#7af5f5] blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                <button
                  onClick={handleDownload}
                  className="
                    relative px-8 py-4 rounded-lg bg-black/30 
                    backdrop-blur-md border border-[#7af5f5]/30
                    hover:border-[#7af5f5] transition-all
                    flex items-center space-x-2
                  "
                >
                  <Download className="w-6 h-6 text-[#7af5f5]" />
                  <span>Download</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <a ref={downloadLinkRef} className="hidden" />
    </div>
  );
};

export default Index;
