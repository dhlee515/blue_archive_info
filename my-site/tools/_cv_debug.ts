async function main(): Promise<void> {
  console.log('importing...');
  const mod = await import('@techstark/opencv-js');
  console.log('imported. has default:', 'default' in mod);
  const def = (mod as unknown as { default?: unknown }).default;
  console.log('default type:', typeof def, 'is promise:', typeof (def as { then?: unknown })?.then === 'function');
  if (def && typeof (def as { then?: unknown }).then === 'function') {
    console.log('awaiting default promise...');
    const cv = await (def as Promise<unknown>);
    console.log('awaited. Mat type:', typeof (cv as { Mat?: unknown }).Mat);
    console.log('keys:', Object.keys(cv as object).length);
    const c = cv as { Mat: new (...a: unknown[]) => { rows: number; delete: () => void }; CV_8UC1: number };
    const m = new c.Mat(10, 10, c.CV_8UC1);
    console.log('mat rows:', m.rows);
    m.delete();
  }
  console.log('done');
}
main().catch((e) => console.error('ERR:', e));
