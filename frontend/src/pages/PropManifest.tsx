/**
 * /plays/:id/props 影件备料单
 * 同一角色跨场合并、按影件类型分组的备料清单；
 * 角色改名、影件调整、场次或角色撤掉后，重载即按最新数据重算。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { EmptyState } from '../components/common/EmptyState';
import { usePlayStore } from '../stores/playStore';
import { ROUTES } from '../router';
import { PROP_PART_LABEL, ROLE_TYPE_COLOR, ROLE_TYPE_LABEL, type PropPart } from '../types/role';
import { listRolesByScenes, listScenesByPlay, type RoleRow, type SceneRow } from '../utils/db';
import { buildPropManifest, type ManifestRoleEntry } from '../utils/propManifest';
import { buildPropManifestText, copyText, exportPropManifestCsvFile } from '../utils/export';

export default function PropManifest() {
  const { id: playId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const plays = usePlayStore((state) => state.plays);
  const playsLoading = usePlayStore((state) => state.loading);
  const selectPlay = usePlayStore((state) => state.selectPlay);

  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const play = plays.find((item) => item.id === playId) ?? null;

  useEffect(() => {
    if (playId) selectPlay(playId);
  }, [playId, selectPlay]);

  /** 从本地库重读场次与角色：改名 / 调件 / 撤场撤角之后，重算都走这里 */
  const reload = useCallback(async () => {
    if (!playId) return;
    setLoading(true);
    try {
      const sceneRows = await listScenesByPlay(playId);
      const roleRows = await listRolesByScenes(sceneRows.map((scene) => scene.id));
      setScenes(sceneRows);
      setRoles(roleRows);
    } finally {
      setLoading(false);
    }
  }, [playId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 备料单：同名角色跨场合并，按影件类型分组；scenes / roles 一变即重算 */
  const manifest = useMemo(() => buildPropManifest(scenes, roles), [scenes, roles]);

  const handleCopy = async () => {
    if (!play) return;
    const ok = await copyText(buildPropManifestText(play, manifest));
    if (ok) message.success('备料单文本已复制，可直接贴给道具师傅');
    else message.error('复制失败，请检查浏览器剪贴板权限');
  };

  const handleExportCsv = () => {
    if (!play) return;
    const filename = exportPropManifestCsvFile(play, manifest);
    message.success(`已导出：${filename}`);
  };

  const columnsFor = (part: PropPart): ColumnsType<ManifestRoleEntry> => [
    {
      title: '角色',
      key: 'name',
      width: 180,
      render: (_value, entry) => (
        <Space size={6} wrap>
          <Typography.Text strong>{entry.name}</Typography.Text>
          <Tag color={ROLE_TYPE_COLOR[entry.roleType]}>{ROLE_TYPE_LABEL[entry.roleType]}</Tag>
        </Space>
      ),
    },
    {
      title: '需备件数',
      key: 'count',
      width: 150,
      render: (_value, entry) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong style={{ color: '#7a1f1f' }}>
            {entry.partCounts[part]} 件
          </Typography.Text>
          {entry.sceneRefs.length > 1 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              跨 {entry.sceneRefs.length} 场复用，只备一份
            </Typography.Text>
          ) : null}
          {entry.partCounts[part] > 1 ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              同场需同时上 {entry.partCounts[part]} 件
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '出场场次',
      key: 'scenes',
      render: (_value, entry) => (
        <Space size={4} wrap>
          {entry.sceneRefs.map((ref) => (
            <Tag key={ref.sceneId}>
              第{ref.seq}场 {ref.title}
              {ref.appearances > 1 ? ` ×${ref.appearances}` : ''}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '该角色其余影件',
      key: 'others',
      width: 150,
      render: (_value, entry) => {
        const others = entry.parts.filter((item) => item !== part);
        return others.length > 0 ? others.map((item) => PROP_PART_LABEL[item]).join('／') : '—';
      },
    },
  ];

  if (!loading && !playsLoading && !play) {
    return (
      <div className="gb-panel">
        <EmptyState
          title="未找到该剧目"
          description="剧目可能已被删除，请回到剧目库重新选择。"
          actionText="回到剧目库"
          onAction={() => navigate(ROUTES.plays)}
        />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="gb-panel">
        <div className="gb-panel-title">
          <Space size={10} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(ROUTES.scenes(playId))}>
              场次拆分
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              影件备料单{play ? ` · ${play.title}` : ''}
            </Typography.Title>
            <Tag color="#7a1f1f">合计 {manifest.totalPieces} 件</Tag>
          </Space>
          <Space wrap>
            <Button
              icon={<CopyOutlined />}
              disabled={!play || manifest.roleCount === 0}
              onClick={() => void handleCopy()}
            >
              复制备料单
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!play || manifest.roleCount === 0}
              onClick={handleExportCsv}
            >
              导出 CSV
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void reload()}>
              重新载入
            </Button>
          </Space>
        </div>

        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Statistic title="出场角色（去重）" value={manifest.roleCount} suffix="个" />
          </Col>
          {manifest.groups.map((group) => (
            <Col xs={12} md={6} key={group.part}>
              <Statistic title={`需备${PROP_PART_LABEL[group.part]}`} value={group.pieceCount} suffix="件" />
            </Col>
          ))}
        </Row>

        <Alert
          style={{ marginTop: 14 }}
          type="info"
          showIcon
          message="同一角色跨场只备一份；同场同名多行才加件"
          description="角色改名、影件调整或场次、角色撤掉后，本单按最新数据重算；「无需拆件」栏用于核对配角是否漏勾影件。"
        />
      </div>

      {!loading && scenes.length === 0 ? (
        <div className="gb-panel">
          <EmptyState
            title="这出戏还没有场次"
            description="先拆场次、登记角色并勾选需备影件，备料单会自动汇总。"
            actionText="去拆场次"
            onAction={() => navigate(ROUTES.scenes(playId))}
          />
        </div>
      ) : !loading && roles.length === 0 ? (
        <div className="gb-panel">
          <EmptyState
            title="还没有登记影人角色"
            description="到角色指派页为各场登记人物影偶并勾选需备影件，备料单会自动汇总。"
            actionText="去登记角色"
            onAction={() => scenes[0] && navigate(ROUTES.roles(scenes[0].id))}
          />
        </div>
      ) : (
        <>
          {manifest.groups.map((group) => (
            <div className="gb-panel" key={group.part}>
              <div className="gb-panel-title">
                <Space size={10} wrap>
                  <Typography.Text strong style={{ fontSize: 16 }}>
                    {PROP_PART_LABEL[group.part]}
                  </Typography.Text>
                  <Tag color="#7a1f1f">{group.pieceCount} 件</Tag>
                  <Tag>{group.roles.length} 个角色</Tag>
                </Space>
              </div>
              {group.roles.length === 0 ? (
                <Typography.Text type="secondary">全剧无需备{PROP_PART_LABEL[group.part]}。</Typography.Text>
              ) : (
                <Table<ManifestRoleEntry>
                  rowKey="name"
                  size="small"
                  className="gb-table-compact"
                  loading={loading}
                  columns={columnsFor(group.part)}
                  dataSource={group.roles}
                  pagination={false}
                />
              )}
            </div>
          ))}

          <div className="gb-panel">
            <div className="gb-panel-title">
              <Space size={10} wrap>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  无需拆件的角色
                </Typography.Text>
                <Tag>{manifest.idleRoles.length} 个</Tag>
              </Space>
            </div>
            {manifest.idleRoles.length === 0 ? (
              <Typography.Text type="secondary">所有出场角色都已勾选影件。</Typography.Text>
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Alert
                  type="warning"
                  showIcon
                  message="以下角色未勾选任何影件，请核对是走场无需拆件，还是漏勾。"
                />
                <Space size={6} wrap>
                  {manifest.idleRoles.map((entry) => (
                    <Tag key={entry.name} color={ROLE_TYPE_COLOR[entry.roleType]}>
                      {entry.name}（{entry.sceneRefs.map((ref) => `第${ref.seq}场`).join('、')}）
                    </Tag>
                  ))}
                </Space>
              </Space>
            )}
          </div>
        </>
      )}
    </Space>
  );
}
