"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

type TrackCaps = {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
};

export type ZoomControl = {
  supported: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  set: (value: number) => void;
};

export type TorchControl = { supported: boolean; on: boolean; toggle: () => void };

export type ScannerControls = {
  zoom: ZoomControl;
  torch: TorchControl;
  /** Ask the camera to re-focus (tap on the picture). */
  refocus: () => void;
  /** Style for the <video>: the digital-zoom scale when the camera has no optical zoom. */
  videoStyle: CSSProperties | undefined;
};

const asConstraint = (advanced: Record<string, unknown>) =>
  ({ advanced: [advanced] }) as unknown as MediaTrackConstraints;

// Focus, zoom and torch for whatever camera stream is playing in `videoRef`.
//  • continuous auto-focus is switched on (phone cameras often default to fixed
//    focus in the browser, which is why small print comes out blurry);
//  • zoom uses the camera's own optical/hardware zoom where the browser exposes it
//    (most Android phones). Where it doesn't (iPhone Safari) and `allowDigital`
//    is set, it falls back to a digital zoom the caller applies via `videoStyle`
//    and `digitalScaleRef`.
export function useTrackControls(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  { allowDigital }: { allowDigital: boolean }
) {
  const trackRef = useRef<MediaStreamTrack | null>(null);
  /** Digital-zoom factor currently applied to the picture (1 when zoom is optical). */
  const digitalScaleRef = useRef(1);
  const digitalRef = useRef(false);
  const [range, setRange] = useState({ min: 1, max: 1, step: 0.1, supported: false, digital: false });
  const [zoomValue, setZoomValue] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!active) return;
    // Deferred a tick so this is a callback, not a direct state update in the effect body.
    const timer = setTimeout(() => {
      const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      trackRef.current = track;
      const caps = (track.getCapabilities?.() ?? {}) as TrackCaps;

      if (caps.focusMode?.includes("continuous")) {
        track.applyConstraints(asConstraint({ focusMode: "continuous" })).catch(() => {});
      }

      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        digitalRef.current = false;
        const settings = track.getSettings?.() as { zoom?: number } | undefined;
        setRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1, supported: true, digital: false });
        setZoomValue(settings?.zoom ?? caps.zoom.min);
      } else if (allowDigital) {
        digitalRef.current = true;
        setRange({ min: 1, max: 4, step: 0.1, supported: true, digital: true });
        setZoomValue(1);
      }
      setTorchSupported(Boolean(caps.torch));
    }, 0);

    return () => {
      clearTimeout(timer);
      trackRef.current = null;
      digitalScaleRef.current = 1;
    };
  }, [active, allowDigital, videoRef]);

  const setZoom = useCallback(
    (value: number) => {
      const clamped = Math.min(range.max, Math.max(range.min, value));
      setZoomValue(clamped);
      if (digitalRef.current) {
        digitalScaleRef.current = clamped;
      } else {
        trackRef.current?.applyConstraints(asConstraint({ zoom: clamped })).catch(() => {});
      }
    },
    [range.max, range.min]
  );

  const refocus = useCallback(() => {
    const track = trackRef.current;
    const caps = (track?.getCapabilities?.() ?? {}) as TrackCaps;
    if (!track || !caps.focusMode?.includes("single-shot")) return;
    track
      .applyConstraints(asConstraint({ focusMode: "single-shot" }))
      .then(() => {
        // Back to continuous once it has locked on.
        setTimeout(() => track.applyConstraints(asConstraint({ focusMode: "continuous" })).catch(() => {}), 1500);
      })
      .catch(() => {});
  }, []);

  const toggleTorch = useCallback(() => {
    const next = !torchOn;
    trackRef.current
      ?.applyConstraints(asConstraint({ torch: next }))
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  }, [torchOn]);

  const controls: ScannerControls = {
    zoom: { supported: range.supported, value: zoomValue, min: range.min, max: range.max, step: range.step, set: setZoom },
    torch: { supported: torchSupported, on: torchOn, toggle: toggleTorch },
    refocus,
    videoStyle: range.digital && zoomValue > 1 ? { transform: `scale(${zoomValue})` } : undefined,
  };

  return { controls, trackRef, digitalScaleRef };
}
