/**
 * /plays/:id/props 影件备料单
 * 出远门前清点影件：同一角色跨场次并成一份，按头茬/身段/兵器分组写明要备的角色与件数。
 * 每次进入页面、窗口重新聚焦或点「重新核算」都会用最新场记重算，
 * 角色改名、影件调整、场次/角色撤掉后不会照旧名单备料。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { EmptyState } from '../components/common/EmptyState';
import { usePlayStore } from '../stores/playStore';
import { ROUTES } from '../router';
import { ROLE_TYPE_COLOR, ROLE_TYPE_LABEL } from '../types/role';
import { listRolesByScenes, listScenesByPlay, type RoleRow, type SceneRow } from '../utils/db';
import { buildPropPrepList, type PropPrepGroup, type PropPrepRoleEntry } from '../utils/propPrep';
import { buildPropPrepText, copyText, exportPropPrepCsvFile } from '../utils/export';

export default function PropPrepList() {
  const { id: playId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const plays = usePlayStore((state) => state.plays);
  const selectPlay = usePlayStore((state) => state.selectPlay);

  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalcAt, setRecalcAt] = useState<Date | null>(null);

  const play = plays.find((item) => item.id === playId) ?? null;

  /** 从本地库重新拉取场记并核算，任何改动后回到本页都会走到这里 */
  const recalc = useCallback(async () => {
    if (!playId) return;
    setLoading(true);
    const sceneRows = await listScenesByPlay(playId);
    const roleRows = await listRolesByScenes(sceneRows.map((scene) => scene.id));
    setScenes(sceneRows);
    setRoles(roleRows);
    setRecalcAt(new Date());
    setLoading(false);
  }, [playId]);

  useEffect(() => {
    if (playId) selectPlay(playId);
  }, [playId, selectPlay]);

  useEffect(() => {
    void recalc();
  }, [recalc]);

  // 窗口重新聚焦时跟着重算，免得在别的页签改过场记后照单错备
  useEffect(() => {
    const onFocus = () => void recalc();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [recalc]);

  const list = useMemo(() => buildPropPrepList(scenes, roles), [scenes, roles]);

  const handleCopy = async () => {
    if (!play) return;
    const ok = await copyText(buildPropPrepText(play, list));
    if (ok) message.success('备料单文本已复制，可直接发给道具师傅');
    else message.warning('复制失败，请检查浏览器剪贴板权限');
  };

  const handleExportCsv = () => {
    if (!play) return;
    const filename = exportPropPrepCsvFile(play, list);
    message.success(`已导出：${filename}`);
  };

  const entryColumns: ColumnsType<PropPrepRoleEntry> = [
    {
      title: '角色',
      dataIndex: 'name',
      width: 220,
      render: (_value, record) => (
        <Space size={6} wrap>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Tag color={ROLE_TYPE_COLOR[record.roleType]}>{ROLE_TYPE_LABEL[record.roleType]}</Tag>
          {record.recordCount > 1 ? (
            <Tooltip title={`该角色在 ${record.recordCount} 场重复出场，已并成一份，只备一件`}>
              <Tag color="gold">{record.recordCount} 场并单</Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: '出场场次',
      dataIndex: 'appearances',
      render: (_value, record) => (
        <Space size={4} wrap>
          {record.appearances.length === 0 ? (
            <Typography.Text type="warning">场次已撤，请确认是否还要备</Typography.Text>
          ) : (
            record.appearances.map((item) => (
              <Tag key={item.sceneId}>
                第{item.seq}场 · {item.title}
              </Tag>
            ))
          )}
        </Space>
      ),
    },
    {
      title: '件数',
      key: 'count',
      width: 90,
      align: 'center',
      render: () => <Typography.Text strong>× 1</Typography.Text>,
    },
  ];

  if (!loading && !play) {
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
            {recalcAt ? (
              <Tag color="gold">
                核算于 {recalcAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </Tag>
            ) : null}
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void recalc()} loading={loading}>
              重新核算
            </Button>
            <Button
              icon={<CopyOutlined />}
              disabled={list.mergedRoleCount === 0}
              onClick={() => void handleCopy()}
            >
              复制清单文本
            </Button>
            <Button
              icon={<DownloadOutlined />}
              type="primary"
              disabled={list.mergedRoleCount === 0}
              onClick={handleExportCsv}
            >
              导出 CSV
            </Button>
          </Space>
        </div>

        <Row gutter={16}>
          <Col xs={12} md={4}>
            <Statistic title="场次数" value={list.sceneCount} suffix="场" />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title="角色（并单后 / 场记行）"
              value={list.mergedRoleCount}
              suffix={`/ ${list.roleRowCount}`}
            />
          </Col>
          {list.groups.map((group) => (
            <Col xs={12} md={4} key={group.part}>
              <Statistic title={`${group.label}`} value={group.total} suffix="件" />
            </Col>
          ))}
          <Col xs={12} md={3}>
            <Statistic title="影件合计" value={list.totalPieces} suffix="件" />
          </Col>
        </Row>

        <Alert
          style={{ marginTop: 14 }}
          type="info"
          showIcon
          message="同一角色在多场出场的影件已并成一份，按角色各备一件即可"
          description="角色改名、影件调整或场次、角色被撤掉后，本单会按最新场记重算；回到本页或点「重新核算」即得新单，不会照旧名单备料。"
        />

        {list.unmarked.length > 0 ? (
          <Alert
            style={{ marginTop: 10 }}
            type="warning"
            showIcon
            message={`有 ${list.unmarked.length} 个角色未勾任何影件，请确认是否漏登`}
            description={
              <Space size={4} wrap>
                {list.unmarked.map((entry) => (
                  <Tag key={entry.name} color="warning">
                    {entry.name}（{ROLE_TYPE_LABEL[entry.roleType]}）
                  </Tag>
                ))}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  到「角色指派」页勾上需备影件后，本单会自动计入。
                </Typography.Text>
              </Space>
            }
          />
        ) : null}
      </div>

      {list.mergedRoleCount === 0 && !loading ? (
        <div className="gb-panel">
          <EmptyState
            title="这出戏还没有登记影人角色"
            description="先到各场的「角色指派」登记人物影偶并勾选需备影件，备料单会自动汇总。"
            actionText="去场次拆分"
            onAction={() => navigate(ROUTES.scenes(playId))}
          />
        </div>
      ) : (
        list.groups.map((group) => <PropGroupPanel key={group.part} group={group} columns={entryColumns} loading={loading} />)
      )}

      {list.mergedRoleCount > 0 ? (
        <div className="gb-panel">
          <Space wrap>
            <TeamOutlined style={{ color: '#7a1f1f' }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              发现并单有误？到各场「角色指派」改正角色名或影件勾选，回本页即按新场记重算。
            </Typography.Text>
            <Button size="small" onClick={() => navigate(ROUTES.scenes(playId))}>
              去改场记
            </Button>
          </Space>
        </div>
      ) : null}
    </Space>
  );
}

/** 单个影件类型的分组面板 */
function PropGroupPanel({
  group,
  columns,
  loading,
}: {
  group: PropPrepGroup;
  columns: ColumnsType<PropPrepRoleEntry>;
  loading: boolean;
}) {
  return (
    <div className="gb-panel">
      <div className="gb-panel-title">
        <Space size={8}>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {group.label}
          </Typography.Text>
          <Tag color="#7a1f1f">{group.total} 件</Tag>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {group.entries.length > 0
            ? `${group.entries.map((entry) => entry.name).join('、')} —— 各备 1 件`
            : '本场戏无需备此类影件'}
        </Typography.Text>
      </div>
      <Table<PropPrepRoleEntry>
        rowKey="name"
        size="small"
        className="gb-table-compact"
        loading={loading}
        columns={columns}
        dataSource={group.entries}
        pagination={false}
        locale={{ emptyText: `无需备${group.label}` }}
      />
    </div>
  );
}
