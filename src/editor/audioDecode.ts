// Minimal shape of the Web Audio API's AudioBuffer this needs - kept as a
// local interface (rather than depending on lib.dom's real AudioBuffer)
// purely so downmixToMono is trivially unit-testable without a real
// AudioContext/decodeAudioData.
export interface DecodedAudio {
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

// Whisper (and this app's transcription pipeline, see electron/
// voiceTranscription.ts) expects mono PCM - averages every channel down to
// one rather than just taking the first, so a stereo recording doesn't
// silently drop audio that only came through the right channel.
export function downmixToMono(buffer: DecodedAudio): Float32Array {
  if (buffer.numberOfChannels <= 1) return buffer.getChannelData(0);

  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}
