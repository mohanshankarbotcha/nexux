export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  children?: WorkspaceTreeNode[];
}

export interface FileMetadata {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  createdAt: number;
  modifiedAt: number;
  isDirectory: boolean;
  isBinary: boolean;
}
