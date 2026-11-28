// 11/28 自動で作った表(tools/noalc_1128_patchgen.py)。手で直さない。
// st: 球場 / name: 模型の中の絵の名前 / size: 絵の大きさ / rects: [x0, y0, x1, y1, 写す元の四角か null(null はまわりの地の色で塗る)] 0〜1・左上が 0
export const NOALC_PATCH = [
  { st: "bay", name: "kb_menus", size: [768, 1024], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E23 fukuoka_r28_lite_interior.glb
  { st: "bay", name: "kb_menus", size: [1536, 2048], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E23 fukuoka_r28_interior.glb
  { st: "bay", name: "kb_names", size: [819, 1024], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E48 fukuoka_r28_lite_interior.glb
  { st: "bay", name: "kb_names", size: [1024, 1280], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E48 fukuoka_r28_interior.glb
  { st: "bay", name: "r27", size: [1024, 1024], rects: [[0.5, 0.625, 0.625, 0.75, [0.625, 0.625, 0.75, 0.75]], [0.5, 0.8125, 1.0, 0.875, [0.0, 0.875, 0.5, 0.9375]]] },   // E03 E04 fukuoka_r28_lite_interior.glb
  { st: "bay", name: "r27", size: [2048, 2048], rects: [[0.5, 0.625, 0.625, 0.75, [0.625, 0.625, 0.75, 0.75]], [0.5, 0.8125, 1.0, 0.875, [0.0, 0.875, 0.5, 0.9375]]] },   // E03 E04 fukuoka_r28_interior.glb
  { st: "bay", name: "r28", size: [1024, 1024], rects: [[0.5, 0.0, 1.0, 0.0625, [0.5, 0.1875, 1.0, 0.25]], [0.28809, 0.00977, 0.48828, 0.04883, null], [0.5, 0.25, 1.0, 0.3125, [0.5, 0.3125, 1.0, 0.375]], [0.0, 0.375, 0.25, 0.4375, [0.25, 0.375, 0.5, 0.4375]], [0.5, 0.4375, 0.75, 0.5, [0.75, 0.4375, 1.0, 0.5]]] },   // E05 E06 E07 E08 E09 fukuoka_r28_lite_interior.glb
  { st: "bay", name: "r28", size: [2048, 2048], rects: [[0.5, 0.0, 1.0, 0.0625, [0.5, 0.1875, 1.0, 0.25]], [0.28809, 0.00977, 0.48828, 0.04883, null], [0.5, 0.25, 1.0, 0.3125, [0.5, 0.3125, 1.0, 0.375]], [0.0, 0.375, 0.25, 0.4375, [0.25, 0.375, 0.5, 0.4375]], [0.5, 0.4375, 0.75, 0.5, [0.75, 0.4375, 1.0, 0.5]]] },   // E05 E06 E07 E08 E09 fukuoka_r28_interior.glb
  { st: "bowl", name: "concourse", size: [1024, 1024], rects: [[0.5, 0.0, 0.75, 0.25, [0.25, 0.25, 0.5, 0.5]], [0.75, 0.75, 1.0, 1.0, [0.75, 0.5, 1.0, 0.75]]] },   // E59 E60 yokohama_r18_interior.glb yokohama_r18_lite_interior.glb
  { st: "bowl", name: "ofshops", size: [1024, 512], rects: [[0.33789, 0.82812, 0.65918, 0.94531, null], [0.67188, 0.82812, 0.99316, 0.94531, null]] },   // E70 E71 yokohama_r18_interior.glb yokohama_r18_lite_interior.glb
  { st: "bowl", name: "posters", size: [1024, 1024], rects: [[0.76172, 0.75684, 0.97168, 0.96191, [0.76172, 0.53223, 0.97168, 0.7373]]] },   // E61 yokohama_r18_interior.glb yokohama_r18_lite_interior.glb yokohama_r18_stadium.glb
  { st: "bowl", name: "rc_menus", size: [2048, 2048], rects: [[0.0, 0.125, 0.5, 0.25, [0.0, 0.375, 0.5, 0.5]], [0.0, 0.875, 0.5, 1.0, [0.0, 0.375, 0.5, 0.5]]] },   // E15 E16 yokohama_r18_interior.glb yokohama_r18_lite_interior.glb
  { st: "bowl", name: "rc_signs", size: [1024, 2048], rects: [[0.0, 0.125, 1.0, 0.1875, [0.0, 0.625, 1.0, 0.6875]], [0.0, 0.875, 1.0, 0.9375, [0.0, 0.625, 1.0, 0.6875]]] },   // E43 E44 yokohama_r18_interior.glb yokohama_r18_lite_interior.glb
  { st: "canal", name: "kb_menus", size: [768, 1024], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E22 funabi_r8_lite_interior.glb
  { st: "canal", name: "kb_menus", size: [1536, 2048], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E22 funabi_r8_interior.glb
  { st: "canal", name: "r7_names", size: [512, 1024], rects: [[0.0, 0.625, 1.0, 0.65625, [0.0, 0.65625, 1.0, 0.6875]]] },   // E40 funabi_r8_lite_interior.glb
  { st: "canal", name: "r7_names", size: [1024, 2048], rects: [[0.0, 0.625, 1.0, 0.65625, [0.0, 0.65625, 1.0, 0.6875]]] },   // E40 funabi_r8_interior.glb
  { st: "canal", name: "r8_mall", size: [910, 1024], rects: [[0.0, 0.16667, 1.0, 0.25, [0.0, 0.25, 1.0, 0.33333]]] },   // E50 funabi_r8_lite_interior.glb
  { st: "canal", name: "r8_mall", size: [1024, 1152], rects: [[0.0, 0.16667, 1.0, 0.25, [0.0, 0.25, 1.0, 0.33333]]] },   // E50 funabi_r8_interior.glb
  { st: "canal", name: "r8_signs", size: [1024, 1024], rects: [[0.25, 0.0625, 0.5, 0.125, [0.25, 0.125, 0.5, 0.1875]], [0.5, 0.0625, 0.75, 0.125, [0.5, 0.125, 0.75, 0.1875]], [0.75, 0.3125, 1.0, 0.375, [0.5, 0.3125, 0.75, 0.375]], [0.0, 0.375, 1.0, 0.4375, [0.0, 0.4375, 1.0, 0.5]]] },   // E51 E52 E53 E54 funabi_r8_interior.glb funabi_r8_lite_interior.glb
  { st: "dome", name: "ads_sheet", size: [682, 1024], rects: [[0.0, 0.33333, 0.5, 0.5, [0.0, 0.16667, 0.5, 0.33333]]] },   // E67 dome_r30_lite_stadium.glb
  { st: "dome", name: "ads_sheet", size: [1024, 1536], rects: [[0.0, 0.33333, 0.5, 0.5, [0.0, 0.16667, 0.5, 0.33333]]] },   // E67 dome_r30_stadium.glb
  { st: "dome", name: "concourse_detail", size: [1024, 1024], rects: [[0.25, 0.0, 0.5, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E45 dome_r30_lite_concourse.glb dome_r30_lite_stadium.glb
  { st: "dome", name: "concourse_detail", size: [1254, 1254], rects: [[0.25, 0.0, 0.5, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E45 dome_r30_concourse.glb dome_r30_stadium.glb
  { st: "dome", name: "concourse_signs", size: [1024, 1024], rects: [[0.25, 0.0, 0.5, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E46 dome_r30_lite_concourse.glb dome_r30_lite_stadium.glb
  { st: "dome", name: "concourse_signs", size: [1254, 1254], rects: [[0.25, 0.0, 0.5, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E46 dome_r30_concourse.glb dome_r30_stadium.glb
  { st: "dome", name: "kb_menus", size: [768, 1024], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E22 dome_r30_lite_concourse.glb
  { st: "dome", name: "kb_menus", size: [1536, 2048], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E22 dome_r30_concourse.glb
  { st: "dome", name: "kb_names", size: [819, 1024], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E47 dome_r30_lite_concourse.glb
  { st: "dome", name: "kb_names", size: [1024, 1280], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E47 dome_r30_concourse.glb
  { st: "dome", name: "r29_facility", size: [512, 1024], rects: [[0.0, 0.125, 1.0, 0.25, [0.0, 0.0, 1.0, 0.125]]] },   // E62 dome_r30_lite_stadium.glb dome_r30_stadium.glb
  { st: "grove", name: "fac", size: [1024, 1024], rects: [[0.0, 0.25, 0.25, 0.5, [0.75, 0.25, 1.0, 0.5]], [0.0, 0.8125, 1.0, 0.875, [0.0, 0.9375, 1.0, 1.0]]] },   // E56 E57 morikage_r12_interior.glb morikage_r12_lite_interior.glb morikage_r12_lite_stadium.glb morikage_r12_stadium.glb
  { st: "grove", name: "menus", size: [2048, 1024], rects: [[0.25, 0.5, 0.5, 0.75, [0.25, 0.25, 0.5, 0.5]], [0.25, 0.75, 0.5, 1.0, [0.25, 0.25, 0.5, 0.5]], [0.75, 0.0, 1.0, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E32 E33 E34 morikage_r12_interior.glb morikage_r12_lite_interior.glb
  { st: "grove", name: "signs", size: [682, 1024], rects: [[0.0, 0.1665, 0.49963, 0.20801, [0.0, 0.08301, 0.49963, 0.125]], [0.41612, 0.39062, 0.49817, 0.45654, [0.41612, 0.47363, 0.49817, 0.53955]], [0.00293, 0.47363, 0.08425, 0.53955, [0.25275, 0.47363, 0.33407, 0.53955]], [0.49963, 0.63477, 0.74945, 0.729, null]] },   // E26 E27 E28 E29 morikage_r12_lite_stadium.glb
  { st: "grove", name: "signs", size: [1024, 2048], rects: [[0.0, 0.1875, 1.0, 0.25, [0.0, 0.4375, 1.0, 0.5]], [0.0, 0.8125, 1.0, 0.875, [0.0, 0.3125, 1.0, 0.375]]] },   // E37 E38 morikage_r12_interior.glb morikage_r12_lite_interior.glb
  { st: "grove", name: "signs", size: [1365, 2048], rects: [[0.0, 0.1665, 0.49963, 0.20801, [0.0, 0.08301, 0.49963, 0.125]], [0.41612, 0.39062, 0.49817, 0.45654, [0.41612, 0.47363, 0.49817, 0.53955]], [0.00293, 0.47363, 0.08425, 0.53955, [0.25275, 0.47363, 0.33407, 0.53955]], [0.49963, 0.63477, 0.74945, 0.729, null]] },   // E26 E27 E28 E29 morikage_r12_stadium.glb
  { st: "koshien", name: "r12_menupanel_5", size: [1024, 256], rects: [[0.0, 0.0, 0.33301, 1.0, [0.66699, 0.0, 1.0, 1.0]], [0.33301, 0.0, 0.66699, 1.0, [0.66699, 0.0, 1.0, 1.0]]] },   // E63a E63b r15_nightlight_stadium.glb
  { st: "koshien", name: "r12_shop_name_lite_img", size: [1024, 1024], rects: [[0.44336, 0.32617, 0.88672, 0.375, [0.44336, 0.47266, 0.88672, 0.52148]]] },   // E66 r15_lite_stadium.glb
  { st: "north", name: "r14", size: [1024, 1024], rects: [[0.5625, 0.1875, 0.625, 0.25, [0.8125, 0.1875, 0.875, 0.25]], [0.0, 0.90625, 0.5, 0.96875, [0.0, 0.59375, 0.5, 0.65625]], [0.75, 0.75, 1.0, 0.875, [0.75, 0.5, 1.0, 0.625]]] },   // E17 E18 E19 sendai_r15_lite_stadium.glb
  { st: "north", name: "r14", size: [2048, 2048], rects: [[0.5625, 0.1875, 0.625, 0.25, [0.8125, 0.1875, 0.875, 0.25]], [0.0, 0.90625, 0.5, 0.96875, [0.0, 0.59375, 0.5, 0.65625]], [0.75, 0.75, 1.0, 0.875, [0.75, 0.5, 1.0, 0.625]]] },   // E17 E18 E19 sendai_r15_interior.glb sendai_r15_stadium.glb
  { st: "north", name: "r15", size: [1024, 1024], rects: [[0.375, 0.55811, 0.5, 0.6665, null], [0.875, 0.71484, 0.9375, 0.80859, null]] },   // E20 E21 sendai_r15_lite_stadium.glb
  { st: "north", name: "r15", size: [2048, 2048], rects: [[0.375, 0.55811, 0.5, 0.6665, null], [0.875, 0.71484, 0.9375, 0.80859, null]] },   // E20 E21 sendai_r15_interior.glb sendai_r15_stadium.glb
  { st: "north", name: "rc_menus", size: [2048, 2048], rects: [[0.5, 0.25, 1.0, 0.375, [0.0, 0.375, 0.5, 0.5]]] },   // E14 sendai_r15_interior.glb
  { st: "north", name: "rc_signs", size: [1024, 2048], rects: [[0.0, 0.3125, 1.0, 0.375, [0.0, 0.4375, 1.0, 0.5]]] },   // E42 sendai_r15_interior.glb sendai_r15_stadium.glb
  { st: "park", name: "concourse", size: [2048, 682], rects: [[0.75, 0.0, 1.0, 0.24927, [0.75, 0.24927, 1.0, 0.5]], [0.5, 0.75073, 0.75, 1.0, null]] },   // E68 E69 jingu_r22_interior.glb jingu_r22_lite_interior.glb
  { st: "park", name: "r22_m", size: [512, 512], rects: [[0.5, 0.54688, 0.75, 0.60547, null]] },   // E55 jingu_r22_lite_stadium.glb
  { st: "park", name: "r22_s", size: [1024, 1024], rects: [[0.5, 0.54688, 0.75, 0.60547, null]] },   // E55 jingu_r22_interior.glb jingu_r22_lite_interior.glb jingu_r22_stadium.glb
  { st: "park", name: "rc_menus", size: [2048, 2048], rects: [[0.0, 0.25, 0.5, 0.375, [0.0, 0.75, 0.5, 0.875]]] },   // E11 jingu_r22_interior.glb jingu_r22_lite_interior.glb
  { st: "park", name: "rc_signs", size: [1024, 2048], rects: [[0.0, 0.25, 1.0, 0.3125, [0.0, 0.625, 1.0, 0.6875]]] },   // E41 jingu_r22_interior.glb jingu_r22_lite_interior.glb
  { st: "railside", name: "menus", size: [1365, 2048], rects: [[0.01465, 0.60059, 0.13187, 0.62988, null]] },   // E24 hiroshima_r24_interior.glb hiroshima_r24_lite_interior.glb
  { st: "railside", name: "menus", size: [2048, 1024], rects: [[0.75, 0.0, 1.0, 0.25, [0.75, 0.25, 1.0, 0.5]], [0.5, 0.5, 0.75, 0.75, [0.5, 0.25, 0.75, 0.5]]] },   // E35 E36 hiroshima_r24_interior.glb hiroshima_r24_lite_interior.glb
  { st: "railside", name: "r24", size: [1024, 1024], rects: [[0.5, 0.19531, 1.0, 0.32031, null]] },   // E10 hiroshima_r24_lite_stadium.glb
  { st: "railside", name: "r24", size: [2048, 2048], rects: [[0.5, 0.19531, 1.0, 0.32031, null]] },   // E10 hiroshima_r24_interior.glb hiroshima_r24_lite_interior.glb hiroshima_r24_stadium.glb
  { st: "railside", name: "signs", size: [1024, 2048], rects: [[0.0, 0.1875, 1.0, 0.25, [0.0, 0.4375, 1.0, 0.5]]] },   // E39 hiroshima_r24_interior.glb hiroshima_r24_lite_interior.glb
  { st: "ring", name: "kb_menus", size: [1536, 2048], rects: [[0.0, 0.5, 1.0, 0.625, [0.0, 0.625, 1.0, 0.75]]] },   // E23 nagoya_r23_interior.glb nagoya_r23_lite_interior.glb
  { st: "ring", name: "r22_signs", size: [1024, 1024], rects: [[0.75, 0.0, 1.0, 0.0625, [0.0, 0.0625, 0.25, 0.125]], [0.25, 0.3125, 0.5, 0.375, [0.0, 0.3125, 0.25, 0.375]]] },   // E12 E13 nagoya_r23_lite_stadium.glb
  { st: "ring", name: "r22_signs", size: [2048, 2048], rects: [[0.75, 0.0, 1.0, 0.0625, [0.0, 0.0625, 0.25, 0.125]], [0.25, 0.3125, 0.5, 0.375, [0.0, 0.3125, 0.25, 0.375]]] },   // E12 E13 nagoya_r23_interior.glb nagoya_r23_lite_interior.glb nagoya_r23_stadium.glb
  { st: "ring", name: "r23_atlas", size: [655, 1024], rects: [[0.75038, 0.08008, 1.0, 0.16016, [0.75038, 0.0, 1.0, 0.08008]], [0.75038, 0.24023, 1.0, 0.32031, [0.75038, 0.16016, 1.0, 0.24023]]] },   // E30 E31 nagoya_r23_lite_stadium.glb
  { st: "ring", name: "r23_atlas", size: [1310, 2048], rects: [[0.75038, 0.08008, 1.0, 0.16016, [0.75038, 0.0, 1.0, 0.08008]], [0.75038, 0.24023, 1.0, 0.32031, [0.75038, 0.16016, 1.0, 0.24023]]] },   // E30 E31 nagoya_r23_interior.glb nagoya_r23_lite_interior.glb nagoya_r23_stadium.glb
  { st: "ring", name: "r23_stall_names", size: [1024, 1280], rects: [[0.0, 0.875, 1.0, 1.0, [0.0, 0.5, 1.0, 0.625]]] },   // E49 nagoya_r23_interior.glb nagoya_r23_lite_interior.glb
  { st: "roof", name: "menus", size: [2048, 1024], rects: [[0.25, 0.5, 0.5, 0.75, [0.25, 0.25, 0.5, 0.5]], [0.25, 0.75, 0.5, 1.0, [0.25, 0.25, 0.5, 0.5]], [0.75, 0.0, 1.0, 0.25, [0.75, 0.25, 1.0, 0.5]]] },   // E32 E33 E34 escon_r22_interior.glb escon_r22_lite_interior.glb
  { st: "roof", name: "r21b", size: [2048, 2048], rects: [[0.0, 0.9375, 0.25, 1.0, [0.0, 0.875, 0.25, 0.9375]]] },   // E72 escon_r22_interior.glb escon_r22_lite_interior.glb
  { st: "roof", name: "r22", size: [2048, 2048], rects: [[0.0, 0.75, 0.25, 1.0, null], [0.25, 0.75, 0.75, 0.875, null]] },   // E01 E02 escon_r22_interior.glb escon_r22_lite_interior.glb escon_r22_stadium.glb
  { st: "roof", name: "signs", size: [1024, 2048], rects: [[0.0, 0.1875, 1.0, 0.25, [0.0, 0.4375, 1.0, 0.5]], [0.0, 0.8125, 1.0, 0.875, [0.0, 0.3125, 1.0, 0.375]]] },   // E37 E38 escon_r22_interior.glb escon_r22_lite_interior.glb
  { st: "shore", name: "facility", size: [1024, 1024], rects: [[0.5, 0.25, 0.75, 0.5, [0.25, 0.25, 0.5, 0.5]]] },   // E58 uminari_r17_interior.glb uminari_r17_lite_interior.glb
  { st: "shore", name: "menus", size: [682, 2048], rects: [[0.0, 0.71582, 0.16422, 0.73633, null]] },   // E25 uminari_r17_interior.glb
];
