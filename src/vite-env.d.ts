// Asset module declarations. Vite resolves these at build time; the
// declarations keep `tsc --noEmit` correct on its own.
declare module '*.css';
declare module '*.svg' {
  const src: string;
  export default src;
}
