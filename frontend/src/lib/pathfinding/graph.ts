export interface Graph {
	nodes: Node[];
	start: Node;
}

export interface Node {
	id: string;
	neighbors: Neighbor[];
	visited: boolean;
	distance: number;
	position: SvgPosition;
}

export interface Neighbor {
	node: Node;
	edgeWeight: number;
}

export interface SvgPosition {
	x: number;
	y: number;
}

export function buildGraph(height: number, width: number) {
	// columns
	const firstColumn = 0.2;
	const secondColumn = 0.4;
	const thirdColumn = 0.6;
	const fourthColumn = 0.8;

	let aNode: Node = {
		id: 'A',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * firstColumn, y: height * 0.2 }
	};

	let bNode: Node = {
		id: 'B',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * firstColumn, y: height * 0.4 }
	};

	let cNode: Node = {
		id: 'C',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * firstColumn, y: height * 0.6 }
	};

	// second column
	let dNode: Node = {
		id: 'D',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * secondColumn, y: height * 0.2 }
	};

	// third column
	let eNode: Node = {
		id: 'E',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * thirdColumn, y: height * 0.8 }
	};

	// fourth column
	let fNode: Node = {
		id: 'F',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * fourthColumn, y: height * 0.6 }
	};

	let gNode: Node = {
		id: 'G',
		neighbors: [],
		visited: false,
		distance: Infinity,
		position: { x: width * fourthColumn, y: height * 0.2 }
	};

	// neighbors
	createNeighbor(aNode, bNode, 1);
	createNeighbor(aNode, dNode, 1);

	createNeighbor(bNode, cNode, 1);

	createNeighbor(cNode, dNode, 3);
	createNeighbor(cNode, eNode, 2);

	createNeighbor(dNode, fNode, 3);
	createNeighbor(dNode, eNode, 2);
	createNeighbor(dNode, gNode, 6);

	createNeighbor(fNode, eNode, 1);
	createNeighbor(fNode, gNode, 1);

	// register nodes
	const nodes = Array(aNode, bNode, cNode, dNode, eNode, fNode, gNode);

	// build graph
	return { nodes: nodes, start: aNode };
}

function createNeighbor(node1: Node, node2: Node, weight: number) {
	node1.neighbors.push({ node: node2, edgeWeight: weight });
	node2.neighbors.push({ node: node1, edgeWeight: weight });
}
