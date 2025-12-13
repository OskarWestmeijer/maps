export type TileType = 'START' | 'END' | 'BLOCK' | 'EMPTY' | 'PATH';

export interface Tile {
	row: number;
	col: number;
	type: TileType;
}

export class Board {
	private tiles: Tile[][];
	private _start: Tile;
	private _end: Tile;
	readonly  rows: number;
	readonly  cols: number;

	constructor(rows: number, cols: number, blockPercent: number = 0) {
		this.rows = rows;
		this.cols = cols;

		// Create tiles with EMPTY type
		this.tiles = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => ({ row: r, col: c, type: 'EMPTY' as TileType }))
		);

		// Add BLOCK tiles
		const totalTiles = rows * cols;
		const blockCount = Math.floor((blockPercent / 100) * totalTiles);

		for (let i = 0; i < blockCount; i++) {
			const tile = this.getRandomEmptyTile();
			tile.type = 'BLOCK';
		}

		// Assign START
		this._start = this.getRandomEmptyTile();
		this._start.type = 'START';

		// Assign END
		this._end = this.getRandomEmptyTile();
		this._end.type = 'END';
	}

	get start(): Tile {
		return this._start;
	}

	get end(): Tile {
		return this._end;
	}

	/** Get tile at a coordinate */
	getTile(row: number, col: number): Tile {
		return this.tiles[row][col];
	}

	/** Set a tile type */
	setTile(row: number, col: number, type: TileType) {
		this.tiles[row][col].type = type;
	}

	/** Return the full tiles array */
	getTiles(): Tile[][] {
		return this.tiles;
	}

	/** Get a random empty tile */
	private getRandomEmptyTile(): Tile {
		let tile: Tile;
		do {
			const r = Math.floor(Math.random() * this.rows);
			const c = Math.floor(Math.random() * this.cols);
			tile = this.tiles[r][c];
		} while (tile.type !== 'EMPTY');
		return tile;
	}
}
