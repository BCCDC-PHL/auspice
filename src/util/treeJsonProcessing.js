import { getDefaultTreeState } from "../reducers/tree";
import { getVaccineFromNode, getTraitFromNode, getDivFromNode } from "./treeMiscHelpers";
import { calcFullTipCounts } from "./treeCountingHelpers";

const pseudoRandomName = () => (Math.random()*1e32).toString(36).slice(0, 6);

/**
 * Adds certain properties to the nodes array - for each node in nodes it adds
 * node.fullTipCount - see calcFullTipCounts() description
 * node.hasChildren {bool}
 * node.arrayIdx  {integer} - the index of the node in the nodes array
 * @param  {array} nodes redux tree nodes
 * @return {array} input array (kinda unnecessary)
 * side-effects: node.hasChildren (bool) and node.arrayIdx (INT) for each node in nodes
 */
const processNodes = (nodes) => {
  const nodeNamesSeen = new Set();
  calcFullTipCounts(nodes[0]); /* recursive. Uses d.children */
  nodes.forEach((d, idx) => {
    d.arrayIdx = idx; /* set an index so that we can access visibility / nodeColors if needed */
    d.hasChildren = typeof d.children !== "undefined";

    /* duplicate or missing names are an error with the dataset, but typically result in
    very hard-to-interpret Auspice errors which we can improve by detecting problems early */
    if (!d.name) {
      d.name = pseudoRandomName();
      console.warn(`Tree node without a name detected. Using the name '${d.name}' and continuing...`);
    }
    if (nodeNamesSeen.has(d.name)) {
      const prev = d.name;
      d.name = `${d.name}_${pseudoRandomName()}`;
      console.warn(`Tree node detected with a duplicate name. Changing '${prev}' to '${d.name}' and continuing...`);
    }
    nodeNamesSeen.add(d.name);
  });
  return nodes;
};

/**
 * Scan the tree for `node.branch_attrs.labels` dictionaries and collect all available
 * (These are the options for the "Branch Labels" sidebar dropdown)
 * @param {Array} nodes tree nodes (flat)
 */
const processBranchLabelsInPlace = (nodes) => {
  const availableBranchLabels = new Set();
  nodes.forEach((n) => {
    if (n.branch_attrs && n.branch_attrs.labels) {
      Object.keys(n.branch_attrs.labels)
        .forEach((labelName) => {
          availableBranchLabels.add(labelName);
          /* cast all branch label values to strings */
          n.branch_attrs.labels[labelName] = String(n.branch_attrs.labels[labelName]);
        });
    }
  });
  return ["none", ...availableBranchLabels];
};


const makeSubtreeRootNode = (nodesArray, subtreeIndicies) => {
  const node = {
    name: "__ROOT",
    node_attrs: {hidden: "always"},
    children: subtreeIndicies.map((idx) => nodesArray[idx])
  };
  node.parent = node;
  // ensure root has minimum observed divergence & date (across subtree roots)
  const observedDivs = node.children.map((n) => getDivFromNode(n)).filter((div) => div!==undefined);
  if (observedDivs.length) node.node_attrs.div = Math.min(...observedDivs);
  const observedTimes = node.children.map((n) => getTraitFromNode(n, "num_date")).filter((num_date) => num_date!==undefined);
  if (observedTimes.length) node.node_attrs.num_date = {value: Math.min(...observedTimes)};
  return node;
};

/**
*  Pre-order tree traversal visits each node using stack.
*  Checks if leaf node based on node.children
*  pushes all children into stack and continues traversal.
*  @param root - deserialized JSON root to begin traversal
*  @returns array  - final array of nodes in order with no dups
*/
const flattenTree = (root) => {
  const stack = [], array = [];
  stack.push(root);
  while (stack.length !== 0) {
    const node = stack.pop();
    array.push(node);
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
  }
  return array;
};

/**
*  Add reference to node.parent for each node in tree
*  For root add root.parent = root
*  Pre-order tree traversal visits each node using stack.
*  Checks if leaf node based on node.children
*  pushes all children into stack and continues traversal.
*  @param root - deserialized JSON root to begin traversal
*/
const appendParentsToTree = (root) => {
  root.parent = root;
  const stack = [];
  stack.push(root);

  while (stack.length !== 0) {
    const node = stack.pop();
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        node.children[i].parent = node;
        stack.push(node.children[i]);
      }
    }
  }
};

/**
 * Currently this is limited in scope, but is intended to parse
 * information on a branch_attr indicating information about minor/
 * major parents (e.g. recombination, subtree position in another tree).
 * @param {Array<Node>} nodes
 */
const addParentInfo = (nodes) => {
  nodes.forEach((n) => {
    n.parentInfo = {
      original: n.parent
    };
  });
};

/**
 * Collects all mutations on the tree
 * @param  {Node[]} nodesArray
 * @return {Object}
 *         keys are mutations in gene:fromPosTo format (e.g. nuc:A123T)
 *         values are integers representing occurrences on tree
 * @todo   The original remit of this function was for homoplasy detection.
 *         If storing all the mutations becomes an issue, we may be able use an array
 *         of mutations observed more than once.
 */
const collectObservedMutations = (nodesArray) => {
  const mutations = {};
  nodesArray.forEach((n) => {
    if (!n.branch_attrs || !n.branch_attrs.mutations) return;
    Object.entries(n.branch_attrs.mutations).forEach(([gene, muts]) => {
      muts.forEach((mut) => {
        mutations[`${gene}:${mut}`] ? mutations[`${gene}:${mut}`]++ : (mutations[`${gene}:${mut}`] = 1);
      });
    });
  });
  return mutations;
};

export const treeJsonToState = (treeJSON) => {
  const trees = Array.isArray(treeJSON) ? treeJSON : [treeJSON];
  const nodesArray = [];
  const subtreeIndicies = [];
  for (const treeRootNode of trees) {
    appendParentsToTree(treeRootNode);
    subtreeIndicies.push(nodesArray.length);
    nodesArray.push(...flattenTree(treeRootNode));
  }
  nodesArray.unshift(makeSubtreeRootNode(nodesArray, subtreeIndicies));
  const nodes = processNodes(nodesArray);
  addParentInfo(nodesArray);
  const vaccines = nodes.filter((d) => {
    const v = getVaccineFromNode(d);
    return (v && (Object.keys(v).length > 1 || Object.keys(v)[0] !== "serum"));
  });
  const availableBranchLabels = processBranchLabelsInPlace(nodesArray);
  const observedMutations = collectObservedMutations(nodesArray);
  return Object.assign({}, getDefaultTreeState(), {
    nodes, vaccines, observedMutations, availableBranchLabels, loaded: true
  });
};
