const { stringify } = require('javascript-stringify')
const { normalizePath } = require('vite')

/** @type {(client: import('../@types').ComponentLoader['client'], id: string) => string} */
function toComponentLoaderImport(client, id) {
  if (typeof client === 'string') {
    return `import loader${id} from ${JSON.stringify(client)};`
  } else {
    return `import { ${client.name} as loader${id} } from ${JSON.stringify(client.mod)};`
  }
}

function toLoaderNameAndArgs(loader) {
  if (loader === true) {
    // special case: a flag with a value of true (ex. hydrate=true)
    // should match to "onClientLoad"
    return ['onClientLoad', '']
  } else if (typeof loader !== 'string') {
    return ['none', '']
  }

  const loaderWithArgs = loader.match(/^(\w+)\((.+)\)$/)
  if (loaderWithArgs && loaderWithArgs.length) {
    return [loaderWithArgs[1], loaderWithArgs[2]]
  } else {
    return [loader, '']
  }
}

/**
 * Generate the `<script>` necessary to load a Component into a given mount point
 * @typedef LoaderScriptParams
 * @property {string} componentPath - path to the component itself, used for the import statement
 * @property {string} id - the unique id for a given mount point
 * @property {Record<string, import('../@types').ComponentLoader>} componentLoaderMap
 * @property {string} loader - the raw loader value as a string (ex. "onClientMedia(...)")
 * @property {Record<string, any>} props - data used when hydrating the component
 * @property {string} children - Stringified HTML children
 * @param {LoaderScriptParams}
 * @returns {string} String of HTML to run loader in the client
 */
module.exports = function toLoaderScript({
  componentPath,
  componentLoaderMap,
  loader,
  id,
  props,
  clientRenderer,
  children,
}) {
  const [loaderName, loaderArgs] = toLoaderNameAndArgs(loader)
  const componentLoader = componentLoaderMap[loaderName]

  if (!componentLoader) return ''

  const targetSelector = `document.querySelector(\`slinkity-mount-point[data-s-id="${id}"]\`)`
  const componentImportPath = JSON.stringify(normalizePath(componentPath))
  const rendererImportPath = JSON.stringify(normalizePath(clientRenderer))
  const componentLoaderImport = toComponentLoaderImport(componentLoader.client, id)
  // TODO: investigate faster and lighter-weight alternatives to the "stringify" lib
  const stringifiedProps = stringify(props)
  let script = ''

  if (componentLoader.isDynamicComponentImport) {
    script = `
${componentLoaderImport}

loader${id}({
  id: ${JSON.stringify(id)},
  args: ${JSON.stringify(loaderArgs)},
  target: ${targetSelector},
  renderer: async () => (await import(${rendererImportPath})).default,
  component: {
    mod: async () => (await import(${componentImportPath})).default,
    props: ${stringifiedProps},
    children: \`
    ${children ?? ''}\`,
  }
});`
  } else {
    script = `
${componentLoaderImport}
import Component${id} from ${componentImportPath};
import renderer${id} from ${rendererImportPath};

loader${id}({
  id: ${JSON.stringify(id)},
  args: ${JSON.stringify(loaderArgs)},
  target: ${targetSelector},
  renderer: renderer${id},
  component: {
    mod: Component${id},
    props: ${stringifiedProps},
    children: \`
    ${children ?? ''}\`,
  }
});`
  }

  return ['<script type="module">', script, '</script>'].join('\n')
}
