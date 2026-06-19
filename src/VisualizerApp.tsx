'use client';

import { useEffect, useRef } from 'react';
import { mountVisualizer } from './visualizer';

export function VisualizerApp() {
  const stageRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const ui = uiRef.current;
    if (!stage || !ui) return;
    return mountVisualizer(stage, ui);
  }, []);

  return (
    <>
      <canvas id="stage" ref={stageRef} />
      <div id="ui" ref={uiRef} />
    </>
  );
}
