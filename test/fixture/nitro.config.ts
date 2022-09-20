import { defineNitroConfig } from '../../src'

export default defineNitroConfig({
  compressPublicAssets: true,
  imports: {
    presets: [
      {
        // TODO: move this to built-in preset
        from: 'scule',
        imports: [
          'camelCase',
          'pascalCase',
          'kebabCase'
        ]
      }
    ]
  },
  publicAssets: [
    {
      baseURL: 'build',
      dir: 'public/build'
    }
  ],
  nodeModulesDirs: [
    './_/node_modules'
  ],
  prerender: {
    crawlLinks: true,
    ignore: [
      // '/api/param/'
    ],
    routes: [
      '/prerender',
      '/icon.png',
      '/404'
    ]
  }
})
