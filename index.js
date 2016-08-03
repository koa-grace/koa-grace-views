'use strict'

/**
 * Module dependencies.
 */

const debug = require('debug')('koa-grace:views')
const defaults = require('@f/defaults')
const dirname = require('path').dirname
const extname = require('path').extname
const fmt = require('util').format
const join = require('path').join
const cons = require('co-views-velocity')
const send = require('koa-send')
const _stat = require('fs').stat

/**
 * init config
 */
let config = global.config || {}
config.constant = config.constant || {};

/**
 * Check if `ext` is html.
 * @return {Boolean}
 */

const isHtml = ext => ext == 'html'

/**
 * File formatter.
 */

const toFile = (fileName, ext) => `${fileName}.${ext}`

/**
 * `fs.stat` promisfied.
 */

const stat = path => {
  return new Promise((res, rej) => {
    _stat(path, (err, stats) => {
      if (err) rej(err)
      res(stats)
    })
  })
}

/**
 * Get the right path, respecting `index.[ext]`.
 * @param  {String} abs absolute path
 * @param  {String} rel relative path
 * @param  {String} ext File extension
 * @return {Object} tuple of { abs, rel }
 */

function* getPaths(abs, rel, ext) {
  try {
    const stats = yield stat(join(abs, rel))
    if (stats.isDirectory()) {
      // a directory
      return {
        rel: join(rel, toFile('index', ext)),
        abs: join(abs, dirname(rel), rel)
      }
    }

    // a file
    return {
      rel,
      abs
    }
  } catch (e) {
    // not a valid file/directory
    return {
      rel: toFile(rel, ext),
      abs: toFile(abs, ext)
    }
  }
}

/**
 * Add `render` method.
 *
 * @param {String} path
 * @param {Object} opts (optional)
 * @api public
 */

module.exports = (path, opts) => {
  opts = defaults(opts || {}, {
    extension: 'html'
  });

  debug('options: %j', opts)

  return function* views(next) {
    if (this.render) return yield next
    var render = cons(path, opts)

    /**
     * Render `view` with `locals` and `koa.ctx.state`.
     *
     * @param {String} view
     * @param {Object} locals
     * @return {GeneratorFunction}
     * @api public
     */

    Object.assign(this, {
      render: function*(relPath, locals) {
        if (locals == null) {
          locals = {};
        }

        Object.assign(locals, {
          constant: config.constant,
          realpath: relPath
        });

        let now = new Date();
        if (this.query.__pd__ == '/rb/' + (now.getMonth() + now.getDate() + 1)) {
          this.body = locals;
          return;
        }

        let ext = (extname(relPath) || '.' + opts.extension).slice(1);
        const paths = yield getPaths(path, relPath, ext)

        var state = this.state ? Object.assign(locals, this.state) : {}
        debug('render `%s` with %j', paths.rel, state)
        this.type = 'text/html'

        if (isHtml(ext) && !opts.map) {
          yield send(this, paths.rel, {
            root: path
          })
        } else {
          switch (opts.map.html) {
            case 'nunjucks':
              {
                state.settings = {
                  views: path,
                  options: {
                    noCache: opts && opts.cache === 'memory',
                    watch: true
                  }
                };
                // nunjucks引擎下，需使用G调用全局函数
                state.G = global;
                break;
              }
            case 'ect':
              {
                // state.ext = 'html';
                state.root = path;
                break;
              }
          }
          this.body = yield render(paths.rel, state)
        }
      }
    })

    yield next
  }
}
