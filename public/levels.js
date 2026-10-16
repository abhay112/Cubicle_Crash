// Height of each level above the ground (0 = ground, -1/-2 = basements). Maps are single-level for now,
// but the server and client already tell levels apart, so multi-level maps can be added later.
export const LV_Y = { 0: 0, '-1': -10, '-2': -20 };
export const levelY = lv => LV_Y[lv] ?? 0;
