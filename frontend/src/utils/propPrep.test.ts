/**
 * 影件备料单聚合的单元测试
 * 核心保证：同一角色多场重复出场只算一份；改名、调件、撤场后重算结果正确。
 */
import { describe, expect, it } from 'vitest';
import { buildPropPrepList } from './propPrep';
import type { ShadowRole } from '../types/role';
import type { Scene } from '../types/scene';

function makeScene(id: string, seq: number, title = `第${seq}场`): Scene {
  return {
    id,
    playId: 'play-1',
    seq,
    title,
    durationMin: 12,
    stageNote: '',
    needsShadowScreen: 'standard',
    progress: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

let roleSeq = 0;
function makeRole(patch: Partial<ShadowRole> & Pick<ShadowRole, 'sceneId' | 'name'>): ShadowRole {
  roleSeq += 1;
  return {
    id: `role-${roleSeq}`,
    roleType: 'dan',
    propParts: ['toucha', 'shenduan'],
    entranceCue: '',
    lineNote: '',
    operatorId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...patch,
  };
}

describe('buildPropPrepList', () => {
  it('同一角色多场出场并成一份，影件不重复计件', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2), makeScene('s3', 3)];
    const roles = [
      makeRole({ sceneId: 's1', name: '白娘子' }),
      makeRole({ sceneId: 's2', name: '白娘子' }),
      makeRole({ sceneId: 's3', name: '白娘子', propParts: ['toucha', 'shenduan', 'bingqi'] }),
      makeRole({ sceneId: 's1', name: '许仙', roleType: 'sheng' }),
    ];

    const list = buildPropPrepList(scenes, roles);

    expect(list.roleRowCount).toBe(4);
    expect(list.mergedRoleCount).toBe(2);

    const bai = list.groups[0].entries.find((entry) => entry.name === '白娘子');
    expect(bai).toBeDefined();
    expect(bai?.recordCount).toBe(3);
    expect(bai?.appearances.map((item) => item.seq)).toEqual([1, 2, 3]);
    // 影件取并集：第三场加勾的兵器并入同一份
    expect(bai?.propParts).toEqual(['toucha', 'shenduan', 'bingqi']);

    // 头茬 2 件（白娘子、许仙），身段 2 件，兵器 1 件（白娘子并单后只算一件）
    expect(list.groups.map((group) => group.total)).toEqual([2, 2, 1]);
    expect(list.totalPieces).toBe(5);
  });

  it('角色改名后按新名并单，旧名不再出现', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2)];
    // 场记里先后登记为「小青」「小青儿」，改名统一后应并成一条
    const roles = [
      makeRole({ sceneId: 's1', name: '小青儿' }),
      makeRole({ sceneId: 's2', name: '小青儿' }),
    ];

    const list = buildPropPrepList(scenes, roles);

    expect(list.mergedRoleCount).toBe(1);
    expect(list.groups[0].entries.map((entry) => entry.name)).toEqual(['小青儿']);
    expect(list.groups[0].total).toBe(1);
  });

  it('名字仅差空白字符的视为同一角色', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2)];
    const roles = [
      makeRole({ sceneId: 's1', name: '法海' }),
      makeRole({ sceneId: 's2', name: ' 法海 ', roleType: 'jing' }),
    ];

    const list = buildPropPrepList(scenes, roles);

    expect(list.mergedRoleCount).toBe(1);
    expect(list.totalPieces).toBe(2);
  });

  it('影件调整后重算：撤勾的件不再计入', () => {
    const scenes = [makeScene('s1', 1)];
    const before = buildPropPrepList(scenes, [
      makeRole({ sceneId: 's1', name: '孙悟空', propParts: ['toucha', 'shenduan', 'bingqi'] }),
    ]);
    expect(before.groups[2].total).toBe(1);

    // 道具师傅把兵器撤勾后用最新场记重算
    const after = buildPropPrepList(scenes, [
      makeRole({ sceneId: 's1', name: '孙悟空', propParts: ['toucha', 'shenduan'] }),
    ]);
    expect(after.groups[2].total).toBe(0);
    expect(after.totalPieces).toBe(2);
  });

  it('角色被撤掉后重算不再出现', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2)];
    const roles = [
      makeRole({ sceneId: 's1', name: '白娘子' }),
      makeRole({ sceneId: 's2', name: '白娘子' }),
      makeRole({ sceneId: 's2', name: '水族头目', roleType: 'shenguai' }),
    ];

    const before = buildPropPrepList(scenes, roles);
    expect(before.mergedRoleCount).toBe(2);

    // 撤掉「水族头目」这一角色行后重算
    const after = buildPropPrepList(scenes, roles.filter((role) => role.name !== '水族头目'));
    expect(after.mergedRoleCount).toBe(1);
    expect(after.groups[0].entries.map((entry) => entry.name)).toEqual(['白娘子']);
  });

  it('场次被撤掉后重算：该场角色行不再计入', () => {
    const allScenes = [makeScene('s1', 1), makeScene('s2', 2)];
    const roles = [
      makeRole({ sceneId: 's1', name: '白娘子' }),
      makeRole({ sceneId: 's2', name: '许仙', roleType: 'sheng' }),
    ];

    const before = buildPropPrepList(allScenes, roles);
    expect(before.mergedRoleCount).toBe(2);

    // 第二场撤掉（级联删角色后只剩 s1 的行）
    const after = buildPropPrepList(
      allScenes.filter((scene) => scene.id === 's1'),
      roles.filter((role) => role.sceneId === 's1'),
    );
    expect(after.mergedRoleCount).toBe(1);
    expect(after.totalPieces).toBe(2);
  });

  it('未勾影件的角色列入待确认，不进任何分组', () => {
    const scenes = [makeScene('s1', 1)];
    const roles = [
      makeRole({ sceneId: 's1', name: '白娘子' }),
      makeRole({ sceneId: 's1', name: '船家', roleType: 'chou', propParts: [] }),
    ];

    const list = buildPropPrepList(scenes, roles);

    expect(list.unmarked.map((entry) => entry.name)).toEqual(['船家']);
    expect(list.groups.every((group) => group.entries.every((entry) => entry.name !== '船家'))).toBe(true);
    expect(list.totalPieces).toBe(2);
  });

  it('同名角色行当登记不一致时取最近修改的一条', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2)];
    const roles = [
      makeRole({ sceneId: 's1', name: '孙悟空', roleType: 'sheng', updatedAt: '2026-09-01T00:00:00.000Z' }),
      makeRole({ sceneId: 's2', name: '孙悟空', roleType: 'chou', updatedAt: '2026-09-10T00:00:00.000Z' }),
    ];

    const list = buildPropPrepList(scenes, roles);

    expect(list.groups[0].entries[0]?.roleType).toBe('chou');
  });

  it('分组内按首次出场场序排序，配角不漏', () => {
    const scenes = [makeScene('s1', 1), makeScene('s2', 2)];
    const roles = [
      makeRole({ sceneId: 's2', name: '配角乙', roleType: 'chou' }),
      makeRole({ sceneId: 's1', name: '主角甲', roleType: 'sheng' }),
      makeRole({ sceneId: 's2', name: '配角丙', roleType: 'jing' }),
    ];

    const list = buildPropPrepList(scenes, roles);

    // 先按首次出场场序，同场再按角色名拼音（丙 bǐng 在 乙 yǐ 前）
    expect(list.groups[0].entries.map((entry) => entry.name)).toEqual(['主角甲', '配角丙', '配角乙']);
  });

  it('空场记：各组为零，不报错', () => {
    const list = buildPropPrepList([], []);

    expect(list.mergedRoleCount).toBe(0);
    expect(list.totalPieces).toBe(0);
    expect(list.groups.map((group) => group.total)).toEqual([0, 0, 0]);
    expect(list.unmarked).toEqual([]);
  });
});
