import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  File as FileIcon,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { WorkspaceTreeNode } from '@nexus/core';

interface FileTreeProps {
  node: WorkspaceTreeNode | null;
  selectedPath?: string;
  onSelectFile: (path: string, relativePath: string) => void;
  isLoading?: boolean;
}

export const FileTree: React.FC<FileTreeProps> = ({
  node,
  selectedPath,
  onSelectFile,
  isLoading,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    '': true, // root expanded
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2 select-none">
        <div className="h-4 bg-nexus-800 rounded animate-pulse w-3/4" />
        <div className="h-4 bg-nexus-800 rounded animate-pulse w-1/2 ml-4" />
        <div className="h-4 bg-nexus-800 rounded animate-pulse w-2/3 ml-4" />
        <div className="h-4 bg-nexus-800 rounded animate-pulse w-3/5 ml-8" />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-4 text-xs text-slate-500 italic select-none">
        No folder open. Click 'Open Folder' to load workspace.
      </div>
    );
  }

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
      return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    }
    if (name.endsWith('.json')) {
      return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    if (name.endsWith('.md')) {
      return <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />;
    }
    return <FileIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  const renderNode = (item: WorkspaceTreeNode, depth: number) => {
    const isExpanded = Boolean(expandedFolders[item.path]);
    const isSelected = selectedPath === item.path || selectedPath === item.relativePath;

    if (item.isDirectory) {
      return (
        <div key={item.path} className="select-none">
          <div
            onClick={() => toggleFolder(item.path)}
            className="flex items-center space-x-1.5 py-1 px-2 rounded hover:bg-nexus-800/60 cursor-pointer text-slate-300 hover:text-white transition-colors text-xs font-mono"
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
            )}
            <span className="truncate">{item.name}</span>
          </div>

          {isExpanded && item.children && (
            <div>
              {item.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={item.path}
        onClick={() => onSelectFile(item.path, item.relativePath)}
        className={`flex items-center space-x-1.5 py-1 px-2 rounded cursor-pointer transition-colors text-xs font-mono select-none ${
          isSelected
            ? 'bg-sky-950/60 text-sky-200 border-l-2 border-sky-400 font-medium'
            : 'text-slate-400 hover:text-slate-200 hover:bg-nexus-800/40'
        }`}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        title={item.relativePath}
      >
        {getFileIcon(item.name)}
        <span className="truncate">{item.name}</span>
      </div>
    );
  };

  return (
    <div className="py-1">
      {node.children ? (
        node.children.map((child) => renderNode(child, 0))
      ) : (
        <div className="p-3 text-xs text-slate-500">Folder is empty</div>
      )}
    </div>
  );
};
