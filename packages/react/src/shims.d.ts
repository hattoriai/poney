declare module 'fontkit' {
  export function create(buffer: Buffer): unknown
}
declare module 'wawoff2' {
  const wawoff2: { decompress(buffer: Uint8Array): Promise<Uint8Array> }
  export default wawoff2
}
