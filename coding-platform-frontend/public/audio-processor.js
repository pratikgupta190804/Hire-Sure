class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    
    const inputChannel = input[0];
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.writeIndex++] = inputChannel[i];
      if (this.writeIndex >= this.bufferSize) {
        this.downsampleAndSend();
        this.writeIndex = 0;
      }
    }
    return true;
  }

  downsampleAndSend() {
    const sampleRateRatio = sampleRate / 16000;
    const newLength = Math.round(this.bufferSize / sampleRateRatio);
    const result = new Int16Array(newLength);
    
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < this.buffer.length; i++) {
        accum += this.buffer[i];
        count++;
      }
      
      let s = Math.max(-1, Math.min(1, accum / (count || 1)));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    this.port.postMessage(result.buffer, [result.buffer]);
  }
}

registerProcessor('audio-processor', AudioProcessor);
