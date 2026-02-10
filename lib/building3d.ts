export const DEFAULT_BUILDING_3D = {
  width: 12,
  depth: 10,
  wallHeights: { ground: 3, first: 2.7, second: 2.7 } as Record<string, number>,
  roof: {
    type: "gable",
    pitch: 35,
    overhang: 0.5,
  } as { type: string; pitch: number; overhang?: number },
  materials: {} as Record<string, string>,
};

export type Building3D = typeof DEFAULT_BUILDING_3D;
