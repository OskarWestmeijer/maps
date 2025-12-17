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

function createNeighbor(node1: Node, node2: Node, weight: number): Neighbor {
	node1.neighbors.push({ node: node2, edgeWeight: weight });
	node2.neighbors.push({ node: node1, edgeWeight: weight });
}

/**
 * Generates a random graph with the given number of nodes.
 * The first created node is the start node.
 * Each node has between 1–maxNeighbors random neighbors with random edge weights (1–maxEdgeWeight).
 *
 * @param nodeCount - Number of nodes to generate
 * @param maxNeighbors - Maximum number of neighbors per node (default: 3)
 * @param maxEdgeWeight - Maximum edge weight (default: 10)
 */
export function generateGraph(
	nodeCount: number,
	maxNeighbors: number = 3,
	maxEdgeWeight: number = 10
): Graph {
	console.log(
		`Generating graph: ${nodeCount} nodes, up to ${maxNeighbors} neighbors, max weight ${maxEdgeWeight}`
	);

	if (nodeCount < 1) {
		throw new Error('Graph must contain at least one node.');
	}

	// Step 1: Create all nodes with letter IDs (A, B, C, ...)
	const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
		id: String.fromCharCode(65 + i), // 'A', 'B', 'C', ...
		neighbors: [],
		visited: false,
		distance: Infinity
	}));

	// Step 2: Randomly assign neighbors
	for (const node of nodes) {
		const neighborCount = Math.floor(Math.random() * maxNeighbors) + 1; // 1–maxNeighbors

		// Choose random unique neighbors different from the node itself
		const possibleNeighbors = nodes.filter((n) => n.id !== node.id);
		const chosenNeighbors = shuffleArray(possibleNeighbors).slice(0, neighborCount);

		for (const neighbor of chosenNeighbors) {
			const edgeWeight = Math.floor(Math.random() * maxEdgeWeight) + 1; // 1–maxEdgeWeight

			// Add neighbor if not already present
			if (!node.neighbors.some((n) => n.node.id === neighbor.id)) {
				node.neighbors.push({ node: neighbor, edgeWeight });
			}

			// Ensure bidirectional edges (undirected graph)
			if (!neighbor.neighbors.some((n) => n.node.id === node.id)) {
				neighbor.neighbors.push({ node, edgeWeight });
			}
		}
	}

	// Step 3: Return graph
	return {
		nodes,
		start: nodes[0]
	};
}

/**
 * Helper: returns a shuffled copy of an array
 */
function shuffleArray<T>(array: T[]): T[] {
	return array
		.map((item) => ({ item, sort: Math.random() }))
		.sort((a, b) => a.sort - b.sort)
		.map(({ item }) => item);
}
