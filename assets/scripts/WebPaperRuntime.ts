import { LabFrame } from "./PaperLabView";
type Module = {
  cwrap(
    name: string,
    result: string,
    args: string[],
  ): (...args: unknown[]) => string;
};
export class WebPaperRuntime {
  private constructor(private invoke: (...args: unknown[]) => string) {}
  static async create(): Promise<WebPaperRuntime> {
    const w = window as unknown as {
      createPaperKernel?: (config: object) => Promise<Module>;
    };
    if (!w.createPaperKernel)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "kernel/paper-kernel.js";
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("无法下载纸张内核，请检查连接后刷新"));
        document.head.append(script);
      });
    const factory = w.createPaperKernel;
    if (!factory) throw new Error("纸张内核未初始化");
    const m = await factory({
      locateFile: (name: string) =>
        new URL(`kernel/${name}`, document.baseURI).href,
    });
    return new WebPaperRuntime(
      m.cwrap("paper_call", "string", [
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "string",
        "number",
      ]),
    );
  }
  call(q: {
    op: string;
    id?: number;
    u?: number;
    v?: number;
    target?: number[];
    dt?: number;
    state?: string;
    pin?: boolean;
    press?: boolean;
  }): LabFrame {
    const codes: Record<string, number> = {
      reset: 0,
      state: 1,
      advance: 2,
      grip: 3,
      move: 4,
      release: 5,
      pause: 6,
      save: 7,
      load: 8,
    };
    if (!(q.op in codes)) throw new Error("未知纸张操作");
    const p = q.target ?? [0, 0, 0];
    const r = JSON.parse(
      this.invoke(
        codes[q.op],
        q.id ?? 0,
        q.u ?? 0,
        q.v ?? 0,
        ...p,
        q.dt ?? 0,
        q.state ?? "",
        (q.pin ? 1 : 0) | (q.press ? 2 : 0),
      ),
    ) as LabFrame;
    if (!r.ok) throw new Error(r.error ?? "纸张内核返回错误");
    return r;
  }
}
