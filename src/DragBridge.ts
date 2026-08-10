import * as vscode from 'vscode';

export type PipeletDragPayload = {
  name: string;
  uri: string;
  content: string;
};

export type EndpointParam = {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
};

export type EndpointResponseDef = {
  status: string;
  description: string;
  sample?: unknown;
};

export type EndpointDragPayload = {
  /** HTTP method in lower case, e.g. "get" */
  method: string;
  /** Path template, e.g. "/users/{id}" */
  path: string;
  /** Display label, e.g. "GET /users/{id}" */
  label: string;
  /** Base URL of the API server */
  baseUrl: string;
  /** Optional short description from the spec */
  summary?: string;
  /** Path / query / header / formData parameters (body excluded) */
  params?: EndpointParam[];
  /** Sample request body (if any) */
  requestSample?: unknown;
  /** All documented response statuses with optional samples */
  responses?: EndpointResponseDef[];
};

const dragStartEmitter = new vscode.EventEmitter<PipeletDragPayload>();
const insertRequestEmitter = new vscode.EventEmitter<PipeletDragPayload>();

export const onPipeletDragStart = dragStartEmitter.event;
export const onPipeletInsertRequest = insertRequestEmitter.event;

export function emitPipeletDragStart(payload: PipeletDragPayload): void {
  dragStartEmitter.fire(payload);
}

export function emitPipeletInsertRequest(payload: PipeletDragPayload): void {
  insertRequestEmitter.fire(payload);
}

const endpointDragStartEmitter = new vscode.EventEmitter<EndpointDragPayload>();
const endpointInsertRequestEmitter = new vscode.EventEmitter<EndpointDragPayload>();

export const onEndpointDragStart = endpointDragStartEmitter.event;
export const onEndpointInsertRequest = endpointInsertRequestEmitter.event;

export function emitEndpointDragStart(payload: EndpointDragPayload): void {
  endpointDragStartEmitter.fire(payload);
}

export function emitEndpointInsertRequest(payload: EndpointDragPayload): void {
  endpointInsertRequestEmitter.fire(payload);
}
