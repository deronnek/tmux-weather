#!/usr/bin/env node

import 'core-js/library'
import { HTTP } from 'http-call'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs-extra'
import * as execa from 'execa'
import * as notifier from 'node-notifier'

const configDir = path.join(os.homedir(), '.config', 'tmux-weather')
const cacheDir = path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches' : '.cache', 'tmux-weather')
const debug = require('debug')('tmux-weather')

fs.mkdirpSync(cacheDir)
fs.mkdirpSync(configDir)

function logError(err: Error) {
  let p = path.join(cacheDir, 'weather.log')
  let log = fs.createWriteStream(p)
  log.write(new Date() + '\n')
  log.write(err.stack + '\n')
  console.log(`#[fg=red]${p.replace(os.homedir(), '~')}`)
  try {
    fs.removeSync(path.join(cacheDir, 'weather.json'))
  } catch (err) {
    console.error(err)
    notify(err.stack)
  }
}

function notify(msg?: string) {
  if (!notifier || !msg) return
  notifier.notify({
    title: 'tmux-weather',
    message: msg,
  })
}

function submitError(err: Error) {
  console.error(err.stack)
  notify(err.stack)
  logError(err)
}

function errorAndExit(err: Error) {
  try {
    submitError(err)
  } catch (err) {
    console.error(err.stack)
    process.exit(1)
  }
}

process.on('uncaughtException', errorAndExit)

type LatLon = {
  latitude: number
  longitude: number
}

interface IWeatherResponse {
  current: {
    weather_descriptions: string[]
    temperature: string
  }
}

const api_key = require(path.join(configDir, 'weatherstack.json')).token

function cache<T>(
  key: string,
  fn: (...args: any[]) => Promise<T>,
  useCacheOnFail = false,
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<any> => {
    let f = path.join(cacheDir, `${key}.json`)
    try {
      let fi = await fs.stat(f)
      if (fi && minutesAgo(60) < fi.mtime) {
        return await fs.readJSON(f)
      }
    } catch (err) {
      debug(err)
      submitError(err)
      await fs.remove(f)
    }
    try {
      let body = await fn(...args)
      await fs.outputJSON(f, body)
      return fs.readJSON(f)
    } catch (err) {
      if (!useCacheOnFail) throw err
      return fs.readJSON(f)
    }
  }
}

function getIcon(weather: IWeatherResponse['current']) {
  switch (weather.weather_descriptions[0]) {
    case 'Sunny':
      // TODO: add sunrise/sunset 🌇 🌅
      return '☀️'
    case 'Clear':
      return '🌙'
    case 'sleet':
    case 'Light Rain':
      return '☔'
    case 'Snow':
      return '❄️'
    case 'wind':
      return '💨'
    case 'fog':
      return '🌁'
    case 'Cloudy':
    case 'Overcast':
      return '☁️'
    case 'Partly cloudy':
      return '⛅️'
    default:
      return weather.weather_descriptions[0]
  }
}

function temp(weather: IWeatherResponse['current']) {
  let temp = parseInt(weather.temperature)
  let color
  if (temp < 40) color = 27
  else if (temp < 50) color = 39
  else if (temp < 60) color = 50
  else if (temp < 70) color = 220
  else if (temp < 80) color = 208
  else if (temp < 90) color = 202
  else color = 196
  return `#[fg=colour${color}]${temp}`
}

function minutesAgo(minutes: number) {
  let d = new Date()
  d.setMinutes(d.getMinutes() - minutes)
  return d
}

const getLatLon = cache(
  'latlon',
  async (): Promise<LatLon> => {
    debug('fetching lat/lon...')
    const { stdout } = await execa('latlon')
    return JSON.parse(stdout)
  },
  true,
)

const getWeather = cache('weather', async ({ latitude, longitude }: LatLon) => {
  // notify('fetching weather data')
  debug('fetching weather...')
  const { body } = await HTTP.get(`http://api.weatherstack.com/current?access_key=${api_key}&query=Minneapolis&units=f`)
  return JSON.parse(body) as IWeatherResponse
})

async function run() {
  await fs.mkdirp(cacheDir)

  const { latitude, longitude } = await getLatLon()
  debug('lat %o, lon: %o', latitude, longitude)
  const weather = await getWeather({ latitude, longitude })
  //debug('Weather struct: %o', weather)
  //console.log(weather.current)
  let currently = weather.current.weather_descriptions
  let current_temp = weather.current.temperature
  debug('got weather: %s and %s', currently, current_temp)
  console.log(`${getIcon(weather.current)} ${temp(weather.current)}`)
}
run().catch(errorAndExit)
