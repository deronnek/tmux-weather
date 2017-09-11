#!/usr/bin/env node

const https = require('https')
const path = require('path')
const os = require('os')
const fs = require('fs')
const exec = require('execa')
const notifier = require('node-notifier')

function notify (msg) {
  if (!notifier) return
  notifier.notify({
    title: 'tmux-weather',
    message: msg
  })
}

function submitError (err) {
  console.error(err.stack)
}


let configDir = path.join(os.homedir(), '.config', 'tmux-weather')
let cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'tmux-weather')
try { fs.mkdirSync(cacheDir) } catch (err) {
  submitError(err)
}

process.on('uncaughtException', (err) => {
  notify(err.stack)
  let p = path.join(cacheDir, 'weather.log')
  let log = fs.createWriteStream(p)
  log.write(new Date() + '\n')
  log.write(err.stack + '\n')
  console.log(`#[fg=red]${p.replace(os.homedir(), '~')}`)
  try {
    fs.unlinkSync(path.join(cacheDir, 'weather.json'))
  } catch (err) {
    notify(err.stack)
  }
})

const forecastIOApiKey = require(path.join(configDir, 'forecastio.json')).token

let minutesAgo = (minutes) => {
  let d = new Date()
  d.setMinutes(d.getMinutes() - minutes)
  return d
}

let cache = (key, fn) => {
  return function () {
    let args = Array.prototype.slice.call(arguments)
    let cb = args.pop()
    let f = path.join(cacheDir, `${key}.json`)
    fs.stat(f, (_, stat) => {
      if (stat && minutesAgo(20) < stat.mtime) {
        fs.readFile(f, (err, body) => {
          if (err) throw err
          try {
            cb.apply(null, JSON.parse(body))
          } catch (err) {
            fs.unlinkSync(f)
            throw err
          }
        })
      } else {
        fn.apply(null, args.concat(function () {
          let args = Array.prototype.slice.call(arguments)
          fs.writeFile(f, JSON.stringify(args, null, 2), (err) => {
            if (err) console.error(err)
          })
          cb.apply(null, args)
        }))
      }
    })
  }
}

let latlon = (cb) => {
  exec('whereami', (error, stdout, stderr) => {
    if (error) throw new Error(`whereami: ${stdout}${stderr}`)
    let lines = stdout.split('\n')
    let lat = lines.find((l) => l.startsWith('Latitude:')).split(': ')[1]
    let lon = lines.find((l) => l.startsWith('Longitude:')).split(': ')[1]
    cb({lat, lon})
  })
}

latlon = cache('latlon', latlon)

let getJSON = (url, cb) => {
  https.get(url, (res) => {
    let body = ''
    res.setEncoding('utf-8')
    res
      .on('error', cb)
      .on('data', (data) => { body += data })
      .on('end', () => {
        if (res.statusCode !== 200) cb(new Error(body))
        else cb(null, JSON.parse(body))
      })
  })
}

getJSON = cache('weather', getJSON)

let getIcon = (weather) => {
  switch (weather.icon) {
    case 'clear-day':
      // TODO: add sunrise/sunset 🌇 🌅
      return '☀️'
    case 'clear-night':
      return '🌙'
    case 'sleet':
    case 'rain':
      return '☔'
    case 'snow':
      return '❄️'
    case 'wind':
      return '💨'
    case 'fog':
      return '🌁'
    case 'cloudy':
      return '☁️'
    case 'partly-cloudy-night':
    case 'partly-cloudy-day':
      return '⛅️'
    default:
      return weather.icon
  }
}

let temp = (weather) => {
  let temp = weather.temperature
  let color
  if (temp < 40) color = 27
  else if (temp < 50) color = 39
  else if (temp < 60) color = 50
  else if (temp < 70) color = 220
  else if (temp < 80) color = 208
  else if (temp < 90) color = 202
  else color = 196
  return `#[fg=colour${color}]${parseInt(temp)}`
}

latlon(function (latlon) {
  notify('fetching weather data')
  getJSON(`https://api.forecast.io/forecast/${forecastIOApiKey}/${latlon.lat},${latlon.lon}`, (err, weather) => {
    if (err) throw err
    console.log(`${getIcon(weather.currently)} ${temp(weather.currently)}`)
  })
})
