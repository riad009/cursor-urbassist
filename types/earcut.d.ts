/**
 * Type declarations for the `earcut` polygon triangulation library.
 *
 * earcut is a CJS module without bundled TypeScript types.
 * This declaration enables `import earcut from "earcut"` usage.
 */
declare module "earcut" {
  /**
   * Triangulate a polygon (with optional holes).
   *
   * @param data   Flat array of vertex coordinates [x0,y0, x1,y1, ...]
   * @param holeIndices  Indices into `data` where each hole's vertices begin
   * @param dim    Number of coordinates per vertex (default: 2)
   * @returns Array of triangle vertex indices into the original vertices
   */
  function earcut(
    data: ArrayLike<number>,
    holeIndices?: ArrayLike<number>,
    dim?: number
  ): number[];

  export default earcut;
}
