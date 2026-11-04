import { native, sys, AudioClip, AudioSource, resources, Node } from "cc";
import { DeviceSample, MotionMode, NO_DEVICE } from "./core/Interaction";
/** No simulated readings or native state bypasses. Unsupported platforms keep the complete touch controls. */
export class DeviceInput {
  private available = sys.isNative && sys.os === sys.OS.IOS;
  private source: AudioSource;
  private rustle: AudioClip | null = null;
  private reward: AudioClip | null = null;
  sound = true;
  constructor(parent: Node) {
    const n = new Node("Paper feedback");
    parent.addChild(n);
    this.source = n.addComponent(AudioSource);
    resources.load("audio/paper", AudioClip, (error, clip) => {
      if (!error) this.rustle = clip;
    });
    resources.load("audio/reward", AudioClip, (error, clip) => {
      if (!error) this.reward = clip;
    });
  }
  sample(): DeviceSample {
    if (!this.available) return { ...NO_DEVICE };
    try {
      return {
        ...NO_DEVICE,
        ...JSON.parse(
          native.reflection.callStaticMethod(
            "OrigamiDeviceInput",
            "sample:",
            "",
          ),
        ),
      };
    } catch {
      this.available = false;
      return { ...NO_DEVICE };
    }
  }
  configure(mode: MotionMode): void {
    this.call("configure:", mode);
  }
  private call(method: string, value: string): void {
    if (!this.available) return;
    try {
      native.reflection.callStaticMethod("OrigamiDeviceInput", method, value);
    } catch {
      this.available = false;
    }
  }
  feedback(kind: "grab" | "fold" | "complete"): void {
    this.call("feedback:", kind);
    const clip =
      kind === "complete" ? this.reward : kind === "fold" ? this.rustle : null;
    if (this.sound && clip)
      this.source.playOneShot(clip, kind === "complete" ? 0.32 : 0.38);
  }
  stop(): void {
    this.configure("touch");
    this.source.stop();
  }
}
