import type { PaginatedData } from '../types/api';
import type {
  CreateSpecGroupPayload,
  SpecGroup,
  SpecGroupQuery,
  UpdateSpecGroupPayload,
} from '../types/spec-group';
import { request } from '../utils/request';

/** 分页查询规格组（含规格项） */
export function fetchSpecGroups(params: SpecGroupQuery): Promise<PaginatedData<SpecGroup>> {
  return request<PaginatedData<SpecGroup>>({ url: '/spec-groups', params });
}

/** 查询全部规格组（不分页，含规格项，供菜品编辑选择） */
export function fetchSpecGroupOptions(merchantId?: number): Promise<SpecGroup[]> {
  return request<SpecGroup[]>({ url: '/spec-groups/options', params: { merchantId } });
}

/** 查询规格组详情 */
export function fetchSpecGroup(id: number): Promise<SpecGroup> {
  return request<SpecGroup>({ url: `/spec-groups/${id}` });
}

/** 新增规格组（规格项一并提交） */
export function createSpecGroup(data: CreateSpecGroupPayload): Promise<SpecGroup> {
  return request<SpecGroup>({ url: '/spec-groups', method: 'post', data });
}

/** 编辑规格组（options 为整体覆盖语义） */
export function updateSpecGroup(id: number, data: UpdateSpecGroupPayload): Promise<SpecGroup> {
  return request<SpecGroup>({ url: `/spec-groups/${id}`, method: 'put', data });
}

/** 删除规格组（软删除，被菜品引用时会被后端拒绝） */
export function removeSpecGroup(id: number): Promise<void> {
  return request<void>({ url: `/spec-groups/${id}`, method: 'delete' });
}
