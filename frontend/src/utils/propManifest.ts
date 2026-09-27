/**
 * 影件备料单（PropManifest）派生逻辑
 * 把散记在各场各角色名下的影件（头茬 / 身段 / 兵器）汇总成一剧一单的备料清单：
 * - 同名角色跨场合并为一条，件数按「同场同时上场的最大套数」计，跨场复用不重复备
 * - 按影件类型分组，写明要备的角色与件数
 * - 纯函数：角色改名、影件调整、场次或角色撤掉后，用最新数据重算即得新单
 */
import { PROP_PART_OPTIONS, type PropPart, type RoleType, type ShadowRole } from '../types/role';
import type { Scene } from '../types/scene';

/** 单个角色在一场里的登记情况 */
export interface ManifestSceneRef {
  sceneId: string;
  seq: number;
  title: string;
  /** 本场同名影偶的行数，>1 表示同场需同时上多件（如龙套成双） */
  appearances: number;
}

/** 跨场合并后的一个角色条目 */
export interface ManifestRoleEntry {
  /** 归并键：去掉首尾空白的角色名 */
  name: string;
  /** 行当（取最早一场的登记） */
  roleType: RoleType;
  /** 各场勾选影件的并集，按 头茬 → 身段 → 兵器 排序 */
  parts: PropPart[];
  /** 每种影件的需备件数：同场同名多行取最大，跨场复用不重复计 */
  partCounts: Record<PropPart, number>;
  /** 出场场次（按场序排列） */
  sceneRefs: ManifestSceneRef[];
}

/** 某一影件类型的分组 */
export interface PropPartGroup {
  part: PropPart;
  roles: ManifestRoleEntry[];
  pieceCount: number;
}

/** 一剧一单的影件备料单 */
export interface PropManifest {
  /** 去重后的角色总数 */
  roleCount: number;
  /** 全部角色条目（按首次出场场序排序） */
  entries: ManifestRoleEntry[];
  /** 按影件类型分组（头茬 / 身段 / 兵器 固定顺序） */
  groups: PropPartGroup[];
  /** 未勾选任何影件的角色（配角防漏核对） */
  idleRoles: ManifestRoleEntry[];
  /** 全剧需备影件合计 */
  totalPieces: number;
}

/** 角色名归并键：去首尾空白；空名兜底，避免空键把不同角色并成一条 */
function manifestKey(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : '（未命名）';
}

function emptyPartCounts(): Record<PropPart, number> {
  return { toucha: 0, shenduan: 0, bingqi: 0 };
}

/**
 * 由场次与影人角色行算出备料单
 * @param scenes 该剧目的场次（顺序不限，函数内按场序排）
 * @param roles  这些场次下的全部影人角色行
 */
export function buildPropManifest(scenes: Scene[], roles: ShadowRole[]): PropManifest {
  const orderedScenes = [...scenes].sort((a, b) => a.seq - b.seq);
  const sceneById = new Map(orderedScenes.map((scene) => [scene.id, scene]));
  const sceneIndex = new Map(orderedScenes.map((scene, index) => [scene.id, index]));

  // 按归并键聚合同名角色；孤儿角色行（所属场次已撤）不计入
  const buckets = new Map<string, ShadowRole[]>();
  roles.forEach((role) => {
    if (!sceneById.has(role.sceneId)) return;
    const key = manifestKey(role.name);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(role);
    else buckets.set(key, [role]);
  });

  const entries: ManifestRoleEntry[] = [...buckets.entries()].map(([name, rows]) => {
    // 行按场序排，最早一场的登记决定行当
    const sortedRows = [...rows].sort(
      (a, b) => (sceneIndex.get(a.sceneId) ?? 0) - (sceneIndex.get(b.sceneId) ?? 0),
    );
    const partCounts = emptyPartCounts();
    const refMap = new Map<string, ManifestSceneRef>();

    sortedRows.forEach((row) => {
      const scene = sceneById.get(row.sceneId);
      if (!scene) return;
      const ref = refMap.get(row.sceneId);
      if (ref) ref.appearances += 1;
      else refMap.set(row.sceneId, { sceneId: scene.id, seq: scene.seq, title: scene.title, appearances: 1 });
    });

    // 每种影件：同场同名多行取最大（同时上场需多套），跨场复用不重复计
    orderedScenes.forEach((scene) => {
      const rowsInScene = sortedRows.filter((row) => row.sceneId === scene.id);
      if (rowsInScene.length === 0) return;
      PROP_PART_OPTIONS.forEach(({ value }) => {
        const inScene = rowsInScene.filter((row) => row.propParts.includes(value)).length;
        if (inScene > partCounts[value]) partCounts[value] = inScene;
      });
    });

    const parts = PROP_PART_OPTIONS.map((option) => option.value).filter((part) => partCounts[part] > 0);

    return {
      name,
      roleType: sortedRows[0]?.roleType ?? 'dan',
      parts,
      partCounts,
      sceneRefs: [...refMap.values()].sort((a, b) => a.seq - b.seq),
    };
  });

  entries.sort((a, b) => {
    const seqA = a.sceneRefs[0]?.seq ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.sceneRefs[0]?.seq ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) return seqA - seqB;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  const groups: PropPartGroup[] = PROP_PART_OPTIONS.map((option) => {
    const groupRoles = entries.filter((entry) => entry.partCounts[option.value] > 0);
    return {
      part: option.value,
      roles: groupRoles,
      pieceCount: groupRoles.reduce((acc, entry) => acc + entry.partCounts[option.value], 0),
    };
  });

  return {
    roleCount: entries.length,
    entries,
    groups,
    idleRoles: entries.filter((entry) => entry.parts.length === 0),
    totalPieces: groups.reduce((acc, group) => acc + group.pieceCount, 0),
  };
}
