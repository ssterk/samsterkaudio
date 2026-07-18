import { useEffect, useRef, type MouseEvent } from "react";

export function Waveform({
  peaks,
  progress,
  onSeek,
}: {
  peaks: number[];
  progress: number;
  onSeek: (fraction: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const barWidth = width / barCount;
    const playedBars = Math.floor(progress * barCount);

    for (let i = 0; i < barCount; i++) {
      const amp = Math.max(peaks[i], 0.02);
      const barHeight = amp * height;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.fillStyle = i < playedBars ? "#c45c3a" : "rgba(242,234,217,0.25)";
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
  }, [peaks, progress]);

  function handleClick(e: MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(1, Math.max(0, fraction)));
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-24 w-full cursor-pointer"
    />
  );
}
