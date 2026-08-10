import React, { useState, useRef } from 'react';
import type { SVGProps } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled, { css } from 'styled-components';
import { NodeWrapper, TopHandle, BottomHandle, RightHandle } from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';
import { usePipeletFiles, useNodeDataUpdate, type PipeletFileEntry } from '../context/PipeletFilesContext';

const Icon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width={64}
    height={64}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect x="2" y="2" width="60" height="60" rx="9" fill="#000000" />
    <rect x="3.5" y="3.5" width="57" height="57" rx="7" fill="#F05412" />
    <path
      d="M11 5H53C57.4183 5 61 8.58172 61 13V55"
      stroke="#FF8A50"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.6"
    />
    <path
      d="M5 53V11C5 6.58172 8.58172 3 13 3"
      stroke="#8A300A"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.5"
      transform="rotate(180 32 32)"
    />
    <rect x="6" y="6" width="52" height="52" rx="5" fill="white" fillOpacity="0.05" />
  </svg>
);

const IconBox = styled.div<{ $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;

  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid #ff7105;
      outline-offset: 3px;
    `}
`;

const CellLabel = styled.div`
  position: absolute;
  top: 4px;
  left: 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 400;
  color: #243447;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.2px;
`;

const FileLabel = styled.div`
  position: absolute;
  top: calc(50% - 32px);
  left: calc(50% + 36px);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  font-weight: 500;
  color: #7ab4f5;
  white-space: nowrap;
  pointer-events: none;
  background: rgba(10, 18, 32, 0.72);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid rgba(66,131,244,0.22);
  letter-spacing: 0.2px;
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(50% + 28px);
  left: 50%;
  transform: translateX(-50%);
  width: 144px;
  background: #1a2535;
  border: 1px solid #2e4668;
  border-radius: 8px;
  overflow: hidden;
  z-index: 1000;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
`;

const DropdownHeader = styled.div`
  padding: 5px 10px 4px;
  font-size: 9px;
  font-weight: 700;
  color: #5a7fa8;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid #2e4668;
`;

const DropdownItem = styled.div<{ $active: boolean }>`
  padding: 7px 10px;
  font-size: 11px;
  color: ${({ $active }) => ($active ? '#fff' : '#92b4d4')};
  background: ${({ $active }) => ($active ? 'rgba(66,131,244,0.25)' : 'transparent')};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: rgba(66, 131, 244, 0.18);
    color: #fff;
  }
`;

interface Data {
  label: string;
  subtitle?: string;
  pipeletFile?: string;
  pipeletHandler?: string;
  pipeletSkill?: string;
  pipeletAi?: Record<string, unknown>;
  pipeletInputs?: Record<string, string>;
  pipeletOutputs?: Record<string, string>;
  [k: string]: unknown;
}

export const ProcessNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const files = usePipeletFiles();
  const updateNodeData = useNodeDataUpdate();

  const openDropdown = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    if (files.length > 0) { setIsOpen(true); }
  };

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  const handleSelect = (file: PipeletFileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateNodeData(id, {
      ...(data as Record<string, unknown>),
      pipeletFile: file.name,
      pipeletHandler: file.handler ?? '',
      pipeletSkill: typeof file.ai?.skill === 'string' ? file.ai.skill : '',
      pipeletAi: file.ai,
      pipeletInputs: file.inputs ?? {},
      pipeletOutputs: file.outputs ?? {},
      subtitle: file.handler ?? data?.subtitle,
    });
    setIsOpen(false);
  };

  const pipeletFile = data?.pipeletFile;
  const pipeletMeta = files.find((file) => file.name === pipeletFile);
  const pipeletLabel = pipeletMeta?.handler ?? data?.pipeletHandler ?? pipeletFile;

  return (
    <NodeWrapper onMouseEnter={openDropdown} onMouseLeave={scheduleClose}>
      <TopHandle    type="target" position={Position.Top}    id="input"  className="node-handle" />
      <BottomHandle type="source" position={Position.Bottom} id="output" className="node-handle" />
      <RightHandle  type="source" position={Position.Right}  id="error"  className="node-handle" />

      <CellLabel>{data?.label ? `${data.label} · ${id}` : id}</CellLabel>

      <IconBox className="node-inner-box" $selected={selected}>
        <Icon />
        <NodeRuntimeOverlay nodeId={id} />
      </IconBox>

      {pipeletFile && <FileLabel title={pipeletLabel}>{pipeletFile}{pipeletLabel && pipeletLabel !== pipeletFile ? ` · ${pipeletLabel}` : ''}</FileLabel>}

      {isOpen && (
        <Dropdown
          className="nodrag nopan"
          onMouseEnter={openDropdown}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownHeader>Assign Pipelet</DropdownHeader>
          {files.map((f) => (
            <DropdownItem
              key={f.name}
              $active={f.name === pipeletFile}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={(e) => handleSelect(f, e)}
            >
              {f.name}{f.handler ? ` · ${f.handler}` : ''}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </NodeWrapper>
  );
};
