/**
 * 影件备料单聚合（纯函数，不碰数据库）
 * 把散记在各场各角色名下的影件按「角色名」跨场次合并：
 * 同一人物在几场重复出场只算一份，再按影件类型（头茬/身段/兵器）分组计数。
 * 角色改名、影件调整、场次/角色撤掉后，用最新数据重新调用本函数即可重算。
 */
import type { PropPart, RoleType, ShadowRole } from '../types/role';
import { PROP_PART_LABEL } from '../types/role';
import type { Scene } from '../types/scene';

/** 影件类型的固定展示顺序（与角色表单勾选顺序一致） */
export const PROP_PART_ORDER: readonly PropPart[] = ['toucha', 'shenduan', 'bingqi'];

/** 合并后的角色条目：同一人物跨场次并成一条 */
export interface PropPrepRoleEntry {
  /** 角色名（合并键，已 trim） */
  name: string;
  /** 行当：同名多条场记不一致时，取最近修改的那条 */
  roleType: RoleType;
  /** 跨场次并集后的需备影件 */
  propParts: PropPart[];
  /** 出场场次（按场序升序） */
  appearances: Array<{ sceneId: string; seq: number; title: string }>;
  /** 合并掉的场记行数，>1 表示该角色多场重复出场 */
  recordCount: number;
}

/** 单个影件类型的分组：要备哪些角色、共几件 */
export interface PropPrepGroup {
  part: PropPart;
  label: string;
  entries: PropPrepRoleEntry[];
  /** 件数 = 组内角色数（每个角色每类影件备一件） */
  total: number;
}

/** 一出台戏的影件备料单 */
export interface PropPrepList {
  groups: PropPrepGroup[];
  /** 未勾任何影件的角色（可能漏登，需道具师傅人工确认） */
  unmarked: PropPrepRoleEntry[];
  /** 有角色的场次数 */
  sceneCount: number;
  /** 场记里的角色行数（合并前） */
  roleRowCount: number;
  /** 合并后的角色数 */
  mergedRoleCount: number;
  /** 影件总件数（各分组合计之和） */
  totalPieces: number;
}

/**
 * 由场次与角色行核算备料单。
 * @param scenes 该剧目的全部场次（用于场序与场次名）
 * @param roles  这些场次下的全部角色行（同一人物可能多场各有一行）
 */
export function buildPropPrepList(scenes: Scene[], roles: ShadowRole[]): PropPrepList {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  // 按角色名归并：同名即同人，与场次无关
  const rowsByName = new Map<string, ShadowRole[]>();
  roles.forEach((role) => {
    const key = role.name.trim();
    if (key === '') return;
    const list = rowsByName.get(key);
    if (list) list.push(role);
    else rowsByName.set(key, [role]);
  });

  const entries: PropPrepRoleEntry[] = [];
  rowsByName.forEach((rows, name) => {
    const latest = rows.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
    const partSet = new Set<PropPart>();
    rows.forEach((row) => row.propParts.forEach((part) => partSet.add(part)));
    const appearances = rows
      .map((row) => sceneById.get(row.sceneId))
      .filter((scene): scene is Scene => scene !== undefined)
      .map((scene) => ({ sceneId: scene.id, seq: scene.seq, title: scene.title }))
      .sort((a, b) => a.seq - b.seq);
    entries.push({
      name,
      roleType: latest.roleType,
      propParts: PROP_PART_ORDER.filter((part) => partSet.has(part)),
      appearances,
      recordCount: rows.length,
    });
  });

  // 排序：先按首次出场场序，再按角色名，主角配角都不漏
  entries.sort((a, b) => {
    const seqA = a.appearances[0]?.seq ?? Number.MAX_SAFE_INTEGER;
    const seqB = b.appearances[0]?.seq ?? Number.MAX_SAFE_INTEGER;
    if (seqA !== seqB) return seqA - seqB;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  const marked = entries.filter((entry) => entry.propParts.length > 0);
  const unmarked = entries.filter((entry) => entry.propParts.length === 0);

  const groups: PropPrepGroup[] = PROP_PART_ORDER.map((part) => {
    const groupEntries = marked.filter((entry) => entry.propParts.includes(part));
    return { part, label: PROP_PART_LABEL[part], entries: groupEntries, total: groupEntries.length };
  });

  return {
    groups,
    unmarked,
    sceneCount: scenes.length,
    roleRowCount: roles.length,
    mergedRoleCount: entries.length,
    totalPieces: groups.reduce((acc, group) => acc + group.total, 0),
  };
}
