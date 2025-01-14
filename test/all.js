const test = require('brittle')
const b4a = require('b4a')
const { create, collect } = require('./helpers')

const Hyperbee = require('..')

test('out of bounds iterator', async function (t) {
  const db = create()

  const b = db.batch()

  await b.put('a', null)
  await b.put('b', null)
  await b.put('c', null)

  await b.flush()

  const s = db.createReadStream({ gt: b4a.from('c') })
  let count = 0

  s.on('data', function (data) {
    count++
  })

  return new Promise(resolve => {
    s.on('end', function () {
      t.is(count, 0, 'no out of bounds reads')
      resolve()
    })
  })
})

test('createHistoryStream reverse', async function (t) {
  const db = create()

  const b = db.batch()

  await b.put('a', null)
  await b.put('b', null)
  await b.put('c', null)

  await b.flush()

  const s = db.createHistoryStream({ reverse: true })

  let res = ''
  s.on('data', function (data) {
    const { key } = data
    res += key
  })

  return new Promise(resolve => {
    s.on('end', function () {
      t.is(res, 'cba', 'reversed correctly')
      resolve()
    })
  })
})

test('out of bounds iterator, string encoding', async function (t) {
  const db = create({ keyEncoding: 'utf8' })

  const b = db.batch()

  await b.put('a', null)
  await b.put('b', null)
  await b.put('c', null)

  await b.flush()

  const s = db.createReadStream({ gte: 'f' })
  let count = 0

  s.on('data', function (data) {
    count++
  })

  return new Promise(resolve => {
    s.on('end', function () {
      t.is(count, 0, 'no out of bounds reads')
      resolve()
    })
  })
})

test('out of bounds iterator, larger db', async function (t) {
  const db = create({ keyEncoding: 'utf8' })

  for (let i = 0; i < 8; i++) {
    await db.put('' + i, 'hello world')
  }

  const s = db.createReadStream({ gte: 'a' })
  let count = 0

  s.on('data', function (data) {
    count++
  })

  return new Promise(resolve => {
    s.on('end', function () {
      t.is(count, 0, 'no out of bounds reads')
      resolve()
    })
  })
})

test('test all short iterators', async function (t) {
  const db = create({ keyEncoding: 'utf8' })

  const MAX = 25

  for (let size = 1; size <= MAX; size++) {
    const reference = []
    for (let i = 0; i < size; i++) {
      const key = '' + i
      await db.put(key, 'hello world')
      reference.push(key)
    }
    reference.sort()

    for (let i = 0; i < size; i++) {
      for (let j = 0; j <= i; j++) {
        for (let k = 0; k < 8; k++) {
          const greater = (k & 1) ? 'gte' : 'gt'
          const lesser = (k >> 1 & 1) ? 'lte' : 'lt'
          const reverse = !!(k >> 2 & 1)
          const opts = {
            [greater]: '' + j,
            [lesser]: '' + i,
            reverse
          }
          const entries = await collect(db.createReadStream(opts))
          if (!validate(size, reference, opts, entries)) {
            return
          }
        }
      }
    }
  }

  t.pass('all iterations passed')

  function validate (size, reference, opts, entries) {
    const start = opts.gt ? reference.indexOf(opts.gt) + 1 : reference.indexOf(opts.gte)
    const end = opts.lt ? reference.indexOf(opts.lt) : reference.indexOf(opts.lte) + 1
    const range = reference.slice(start, end)
    if (opts.reverse) range.reverse()
    for (let i = 0; i < range.length; i++) {
      if (!entries[i] || range[i] !== entries[i].key) {
        console.log('========')
        console.log('SIZE:', size)
        console.log('FAILED WITH OPTS:', opts)
        console.log('  expected:', range, 'start:', start, 'end:', end)
        console.log('  actual:', entries.map(e => e.key))
        t.fail('ranges did not match')
        return false
      }
    }
    return true
  }
})

test('test all short iterators, sub database', async function (t) {
  const parent = create({ keyEncoding: 'utf8' })
  const db = parent.sub('sub1')

  const MAX = 25

  for (let size = 1; size <= MAX; size++) {
    const reference = []
    for (let i = 0; i < size; i++) {
      const key = '' + i
      await db.put(key, 'hello world')
      await parent.put(key, 'parent hello world')
      reference.push(key)
    }
    reference.sort()

    for (let i = 0; i < size; i++) {
      for (let j = 0; j <= i; j++) {
        for (let k = 0; k < 8; k++) {
          const greater = (k & 1) ? 'gte' : 'gt'
          const lesser = (k >> 1 & 1) ? 'lte' : 'lt'
          const reverse = !!(k >> 2 & 1)
          const opts = {
            [greater]: '' + j,
            [lesser]: '' + i,
            reverse
          }
          const entries = await collect(db.createReadStream(opts))
          if (!validate(size, reference, opts, entries)) {
            return
          }
        }
      }
    }
  }

  t.pass('all iterations passed')

  function validate (size, reference, opts, entries) {
    const start = opts.gt ? reference.indexOf(opts.gt) + 1 : reference.indexOf(opts.gte)
    const end = opts.lt ? reference.indexOf(opts.lt) : reference.indexOf(opts.lte) + 1
    const range = reference.slice(start, end)
    if (opts.reverse) range.reverse()
    for (let i = 0; i < range.length; i++) {
      if (!entries[i] || range[i] !== entries[i].key) {
        console.log('========')
        console.log('SIZE:', size)
        console.log('FAILED WITH OPTS:', opts)
        console.log('  expected:', range, 'start:', start, 'end:', end)
        console.log('  actual:', entries.map(e => e.key))
        t.fail('ranges did not match')
        return false
      }
    }
    return true
  }
})

test('simple sub put/get', async function (t) {
  const db = create()
  const sub = db.sub('hello')
  await sub.put('world', 'hello world')
  const node = await sub.get('world')
  t.is(node && node.key, 'world')
  t.is(node && node.value, 'hello world')
})

test('multiple levels of sub', async function (t) {
  const db = create({ sep: '!' })
  const sub = db.sub('hello').sub('world')
  await sub.put('a', 'b')

  const encoded = sub.keyEncoding.encode('a')

  {
    const node = await sub.get('a')
    t.is(node && node.key, 'a')
    t.is(node && node.value, 'b')
  }

  {
    const node = await db.get(encoded)
    t.is(node && node.key, b4a.toString(encoded, 'utf-8'))
    t.is(node && node.value, 'b')
  }

  {
    const key = 'hello' + db.sep + 'world' + db.sep + 'a'
    t.is(key, b4a.toString(encoded, 'utf-8'))
    const node = await db.get(key)
    t.is(node && node.key, key)
    t.is(node && node.value, 'b')
  }
})

test('multiple levels of sub, entries outside sub', async function (t) {
  const db = create({ sep: '!' })
  const helloSub = db.sub('hello')
  const worldSub = helloSub.sub('world')
  await helloSub.put('a', 'b')
  await worldSub.put('b', 'c')

  const expected = [['b', 'c']]
  for await (const { key, value } of worldSub.createReadStream()) {
    const next = expected.shift()
    if (!next) {
      t.fail('iterated unexpected value')
      break
    }
    t.is(key, next[0])
    t.is(value, next[1])
  }
  t.is(expected.length, 0)
})

test('sub respects keyEncoding', async function (t) {
  t.plan(2)

  const db = create({ sep: '!' })
  const helloSub = db.sub('hello', {
    keyEncoding: {
      encode (key) {
        return b4a.from(key.key)
      },
      decode (buf) {
        return { key: b4a.toString(buf) }
      }
    }
  })

  await helloSub.put({ key: 'hello' }, 'val')

  for await (const data of helloSub.createReadStream()) {
    t.alike(data.key, { key: 'hello' })
  }

  const node = await helloSub.get({ key: 'hello' })

  t.ok(node)
})

test('sub with a key that starts with 0xff', async function (t) {
  t.plan(2)

  const db = create({ sep: '!', keyEncoding: 'binary' })
  const helloSub = db.sub('hello')
  const key = b4a.from([0xff, 0x01, 0x02])

  await helloSub.put(key, 'val')

  for await (const data of helloSub.createReadStream()) {
    t.alike(data.key, key)
  }

  const node = await helloSub.get(key)

  t.ok(node)
})

test('read stream on sub checkout returns only sub keys', async function (t) {
  t.plan(3)

  const db = create({ sep: '!', keyEncoding: 'utf-8' })
  const sub = db.sub('sub')

  await db.put('a', 'a')
  await sub.put('sa', 'sa')
  await sub.put('sb', 'sb')

  const checkout = sub.snapshot()

  await db.put('b', 'b')

  const keys = []
  for await (const { key } of checkout.createReadStream()) {
    keys.push(key)
  }

  t.is(keys.length, 2)
  t.is(keys[0], 'sa')
  t.is(keys[1], 'sb')
})

test('read stream on double sub checkout', async function (t) {
  t.plan(3)

  const db = create({ sep: '!', keyEncoding: 'utf-8' })
  const sub = db.sub('sub')

  await db.put('a', 'a')
  await sub.put('sa', 'sa')
  await sub.put('sb', 'sb')

  const checkout = sub.snapshot().snapshot()

  await db.put('b', 'b')

  const keys = []
  for await (const { key } of checkout.createReadStream()) {
    keys.push(key)
  }

  t.is(keys.length, 2)
  t.is(keys[0], 'sa')
  t.is(keys[1], 'sb')
})

test('setting read-only flag to false disables header write', async function (t) {
  const db = create({ readonly: true })
  await db.ready()
  t.is(db.feed.length, 0)
  t.ok(db.readonly)
})

test('cannot append to read-only db', async function (t) {
  const db = create({ readonly: true })
  await db.ready()
  await t.exception(() => db.put('hello', 'world'))
})

test('feed is unwrapped in getter', async function (t) {
  const Hypercore = require('hypercore')
  const feed = new Hypercore(require('random-access-memory'))
  const db = new Hyperbee(feed)
  await db.ready()
  t.ok(feed === db.feed)
})

test('get header out', async function (t) {
  const db = create()
  await db.ready()
  await db.put('hi', 'ho')
  const h = await db.getHeader()
  t.is(h.protocol, 'hyperbee')
})
