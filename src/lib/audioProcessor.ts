
export class AudioProcessor {
  private context: AudioContext;
  private analyser: AnalyserNode;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor() {
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        this.chunks.push(e.data);
      };
      this.mediaRecorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return;
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  async anonymizeAudio(audioBlob: Blob, settings: any): Promise<Blob> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    
    // Log original audio stats
    console.log('Original Audio Stats:', {
      length: audioBuffer.length,
      channels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate
    });

    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const outputBuffer = offlineContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // Process each channel
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const inputData = audioBuffer.getChannelData(channel);
      const outputData = outputBuffer.getChannelData(channel);
      
      // Process in small chunks to avoid stack overflow
      const CHUNK_SIZE = 2048;
      
      for (let i = 0; i < inputData.length; i += CHUNK_SIZE) {
        const chunkEnd = Math.min(i + CHUNK_SIZE, inputData.length);
        const currentChunk = inputData.slice(i, chunkEnd);
        
        // Apply effects
        for (let j = 0; j < currentChunk.length; j++) {
          let sample = currentChunk[j];
          
          // Apply time-domain effects
          if (settings.useTimeDistortion) {
            sample = Math.tanh(sample * settings.timeDistortionAmount);
          }
          
          // Apply frequency shift
          const phase = 2 * Math.PI * (j / currentChunk.length) * settings.frequencyShiftMultiplier;
          sample *= Math.cos(phase);
          
          // Apply noise
          if (settings.noiseAmount > 0) {
            sample += (Math.random() * 2 - 1) * settings.noiseAmount;
          }
          
          // Phase inversion if enabled
          if (settings.useAdditionalPhaseDistortion) {
            sample *= -1;
          }
          
          // Store processed sample
          outputData[i + j] = sample;
        }
      }
    }

    // Create a source node and render
    const source = offlineContext.createBufferSource();
    source.buffer = outputBuffer;
    source.connect(offlineContext.destination);
    source.start();

    const renderedBuffer = await offlineContext.startRendering();
    
    // Log final stats
    console.log('Final Output Stats:', {
      length: renderedBuffer.length,
      channels: renderedBuffer.numberOfChannels,
      sampleRate: renderedBuffer.sampleRate
    });

    return this.audioBufferToWav(renderedBuffer);
  }

  async createAudioElement(blob: Blob): Promise<HTMLAudioElement> {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
    });
    return audio;
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const view = new DataView(new ArrayBuffer(44 + length));

    // Write WAV header
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const data = new Float32Array(buffer.length * buffer.numberOfChannels);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      data.set(buffer.getChannelData(i), buffer.length * i);
    }

    let offset = 44;
    for (let i = 0; i < data.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
