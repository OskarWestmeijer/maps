export type TileType = 'START' | 'END' | 'BLOCK' | 'EMPTY' | 'PATH';

export interface Coord {
	row: number;
	col: number;
}

export interface Node {
	coord: Coord;
	type: TileType; // BLOCK, EMPTY, START, END, PATH
	neighbors: Node[]; // edges to adjacent walkable nodes
}

/**
 * Map represents a 2D grid as a graph of nodes.
 * Each node knows its coordinates and edges (neighbors).
 */
export class Map {
	private nodes: Node[][];
	private _startNode: Node;
	private _endNode: Node;
	readonly rows: number;
	readonly cols: number;

	constructor(rows: number, cols: number, blockPercent: number = 0) {
		this.rows = rows;
		this.cols = cols;

		// Step 1: Create nodes
		this.nodes = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => ({
				coord: { row: r, col: c },
				type: 'EMPTY' as TileType,
				neighbors: []
			}))
		);

		// Step 2: Add BLOCK nodes randomly
		const totalTiles = rows * cols;
		const blockCount = Math.floor((blockPercent / 100) * totalTiles);
		for (let i = 0; i < blockCount; i++) {
			const tile = this.getRandomEmptyNode();
			tile.type = 'BLOCK';
		}

		// Step 3: Assign START and END
		this._startNode = this.getRandomEmptyNode();
		this._startNode.type = 'START';

		this._endNode = this.getRandomEmptyNode();
		this._endNode.type = 'END';

		// Step 4: Build edges (neighbors) for all walkable nodes
		this.buildEdges();
	}

	/** Get the start node */
	get startNode(): Node {
		return this._startNode;
	}

	/** Get the end node */
	get endNode(): Node {
		return this._endNode;
	}

	/** Return all nodes as 2D array */
	getNodes(): Node[][] {
		return this.nodes;
	}

	/** Get a node at a specific coordinate */
	getNode(row: number, col: number): Node {
		return this.nodes[row][col];
	}

	/** Set node type */
	setNodeType(row: number, col: number, type: TileType) {
		this.nodes[row][col].type = type;
	}

	/** Get a random empty node */
	private getRandomEmptyNode(): Node {
		let node: Node;
		do {
			const r = Math.floor(Math.random() * this.rows);
			const c = Math.floor(Math.random() * this.cols);
			node = this.nodes[r][c];
		} while (node.type !== 'EMPTY');
		return node;
	}

	/** Build neighbor edges for all nodes */
	private buildEdges() {
		const directions = [
			{ dr: -1, dc: 0 },
			{ dr: 1, dc: 0 },
			{ dr: 0, dc: -1 },
			{ dr: 0, dc: 1 }
		];

		for (let r = 0; r < this.rows; r++) {
			for (let c = 0; c < this.cols; c++) {
				const node = this.nodes[r][c];
				node.neighbors = [];
				if (node.type === 'BLOCK') continue; // BLOCK nodes have no edges

				for (const { dr, dc } of directions) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
					const neighbor = this.nodes[nr][nc];
					if (neighbor.type !== 'BLOCK') {
						node.neighbors.push(neighbor);
					}
				}
			}
		}
	}
}
