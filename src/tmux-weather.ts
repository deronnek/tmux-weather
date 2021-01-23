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
  console.log(`#[fg=red]Weather data unavailable`)
  try {
    fs.removeSync(path.join(cacheDir, 'weather.json'))
  } catch (err) {
    console.error(err)
    // notify(err.stack)
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
  // notify(err.stack)
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

interface NWSWeatherResponse {
  //context: [
  //{
  properties: {
    temperature: {
      value: number
    }
    windChill: {
      value: number
    }
    heatIndex: {
      value: number
    }
    textDescription: string
  }
  // }
  //]
}

interface IWeatherResponse {
  current: {
    weather_descriptions: string[]
    temperature: string
    feelslike: string
  }
}

// const api_key = require(path.join(configDir, 'weatherstack.json')).token

function cache<T>(
  key: string,
  fn: (...args: any[]) => Promise<T>,
  useCacheOnFail = false,
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<any> => {
    let f = path.join(cacheDir, `${key}.json`)
    try {
      let fi = await fs.stat(f)
      if (fi && minutesAgo(30) < fi.mtime) {
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

function getIcon(weather: NWSWeatherResponse) {
  let colour = 12
  switch (weather.properties.textDescription) {
    case 'Mostly Clear':
    case 'Sunny':
      // TODO: add sunrise/sunset 🌇 🌅
      return '☀️'
    case 'Clear':
      return '🌙'
    case 'sleet':
    case 'Light Rain':
      return '☔'
    case 'Light Rain, Mist':
      return '🌧️'
    case 'Snow, Freezing Fog':
      return `#[fg=colour${colour}]` + '❄️  and freezing fog'
    case 'Snow':
      return '❄️'
    case 'Light Snow':
      return '🌨️'
    case 'Light Snow, Mist':
      return `#[fg=colour${colour}]` + '❄️  and Mist'
    case 'wind':
      return '💨'
    case 'Fog':
      return '🌁'
    case 'Haze':
      return '🌫️'
    case 'Mostly Cloudy':
    case 'Cloudy':
    case 'Overcast':
      return '☁️'
    case 'Partly cloudy':
    case 'Partly Cloudy':
      return '⛅️'
    default:
      //return weather.weather_descriptions[0]
      return `#[fg=colour${colour}]${weather.properties.textDescription}`
  }
}

type colorMap = { [key: string]: number }

function cToF(temp: number) {
  debug('Temp:')
  debug(temp)
  if (temp == null) {
    return NaN
  }
  return Math.floor(temp * (9 / 5) + 32)
}

function feelsLike(weather: NWSWeatherResponse) {
  if (weather.properties.windChill.value != null) {
    return cToF(weather.properties.windChill.value)
  } else if (weather.properties.heatIndex.value != null) {
    return cToF(weather.properties.heatIndex.value)
  }
  if (weather.properties.temperature.value == null) {
    debug('NULL TEMPERATURE')
    return '???'
  }

  return cToF(weather.properties.temperature.value)
}

function temp(weather: NWSWeatherResponse) {
  let temp = cToF(weather.properties.temperature.value)
  let feelslike = feelsLike(weather)
  var color: number = 21
  var fcolor: number = 21
  //let cmap: colorMap = {
  //  '100': 124,
  //  '92': 130,
  //  '85': 136,
  //  '78': 142,
  //  '71': 106,
  //  '64': 70,
  //  '57': 34,
  //  '50': 35,
  //  '43': 36,
  //  '36': 37,
  //  '29': 31,
  //  '22': 25,
  //  '15': 21,
  //  '8': 55,
  //  '1': 91,
  //  '-5': 127,
  //  '-12': 126,
  //  '-20': 125,
  //}

  //let cmap: colorMap = {"100": 196, "95": 202, "90": 208, "86": 214, "81": 220, "76": 190, "72": 154, "67": 118, "63": 82, "58": 46, "53": 47, "49": 48, "44":
  //49, "39": 50, "35": 45, "30": 39, "26": 33, "21": 27, "16": 21, "12": 57, "7": 93, "3": 129, "-1": 165, "-6": 200, "-10": 199, "-15":
  //198, "-20": 197}
  let cmap: [string, number][] = [
    ['100', 196],
    ['95', 202],
    ['90', 208],
    ['86', 214],
    ['81', 220],
    ['76', 190],
    ['72', 154],
    ['67', 118],
    ['63', 82],
    ['58', 46],
    ['53', 47],
    ['49', 48],
    ['44', 49],
    ['39', 50],
    ['35', 45],
    ['30', 39],
    ['26', 33],
    ['21', 27],
    ['16', 21],
    ['12', 57],
    ['7', 93],
    ['3', 129],
    ['-1', 165],
    ['-6', 200],
    ['-10', 199],
    ['-15', 198],
    ['-20', 197],
  ]

  for (let i = 0; i < cmap.length; i++) {
    if (temp < parseInt(cmap[i][0])) {
      color = cmap[i][1]
    }
  }
  for (let i = 0; i < cmap.length; i++) {
    if (feelslike < parseInt(cmap[i][0])) {
      fcolor = cmap[i][1]
    }
  }
  /*
  if      (temp <  0) color = 111
  else if (temp < 32) color = 4
  else if (temp < 40) color = 39
  else if (temp < 50) color = 69
  else if (temp < 60) color = 105
  else if (temp < 70) color = 220
  else if (temp < 80) color = 208
  else if (temp < 90) color = 202

  else if (temp > 90) color = 196
 */
  debug(color)
  debug(fcolor)
  return `#[fg=colour${color}]${temp} 	#[fg=colour12]feels like #[fg=colour${fcolor}]${feelslike}`
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
  //const { body } = await HTTP.get(`http://api.weatherstack.com/current?access_key=${api_key}&query=Minneapolis&units=f`)
  const { body } = await HTTP.get(`https://api.weather.gov/stations/KMSP/observations/latest`)
  return JSON.parse(body) as NWSWeatherResponse
})

async function run() {
  await fs.mkdirp(cacheDir)

  // const { latitude, longitude } = await getLatLon()
  const latitude = 0.0
  const longitude = 0.0
  debug('lat %o, lon: %o', latitude, longitude)
  const weather = await getWeather({ latitude, longitude })
  //debug('Weather struct: %o', weather)
  debug(weather.properties)
  let currently = weather.properties.textDescription
  let current_temp = weather.properties.temperature
  //debug('got weather: %s and %s', currently, current_temp)
  console.log(`${getIcon(weather)}  ${temp(weather)}`)
}
run().catch(errorAndExit)
