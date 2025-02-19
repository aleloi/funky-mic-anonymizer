
import { useState, useRef } from 'react';
import { AudioProcessor } from '@/lib/audioProcessor';
import { Glasses, Mic, Download, MicOff } from 'lucide-react';

const audioProcessor = new AudioProcessor();

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const handleRecord = async () => {
    if (isRecording) {
      setIsProcessing(true);
      const audioBlob = await audioProcessor.stopRecording();
      const anonymizedBlob = await audioProcessor.anonymizeAudio(audioBlob);
      setProcessedBlob(anonymizedBlob);
      setIsRecording(false);
      setIsProcessing(false);
    } else {
      await audioProcessor.startRecording();
      setIsRecording(true);
      setProcessedBlob(null);
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
                <span>Download Anonymized Audio</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <a ref={downloadLinkRef} className="hidden" />
    </div>
  );
};

export default Index;
