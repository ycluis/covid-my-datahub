const axios = require('axios')
const { StringStream } = require('scramjet')
const papa = require('papaparse')
const Query = require('../query/Query')
const query = new Query()

const COVID_SYMBOL = process.env.COVID_SYMBOL
const STATE_COVID_DATA_URL = process.env.STATE_COVID_DATA_URL
const STATE_VACC_DATA_URL = process.env.STATE_VACC_DATA_URL

const getLatestStateData = async (reqType) => {
  let dataSet = []
  const url = reqType === COVID_SYMBOL ? STATE_COVID_DATA_URL : STATE_VACC_DATA_URL

  try {
    const req = await axios.get(url, {
      responseType: 'stream',
    })

    const data = req.data.pipe(new StringStream())

    const promise = new Promise((resolve, reject) => {
      papa.parse(data, {
        header: true,
        complete: (result) => {
          dataSet = result.data

          if (dataSet) {
            resolve(dataSet.splice(-16))
          } else {
            reject(new Error(`Error fetching data ${reqType} - ${url}`))
          }
        },
      })
    })

    const parsedData = await promise

    const dataToBeInsert = parsedData.map((data) => ({
      date: data.date,
      state: data.state,
      info: JSON.stringify(data),
    }))

    console.log(`Latest available data set ${reqType}-[STATE]: ${parsedData[parsedData.length - 1].date}`)

    // Postgres Insert
    await insertIntoPostgres(dataToBeInsert, reqType)
  } catch (err) {
    console.log(err)
  } finally {
    /* empty */
  }
}

const insertIntoPostgres = async (parsedData, reqType) => {
  const latestDate =
    reqType === COVID_SYMBOL ? await query.getLatestStateCovData() : await query.getLatestStateVaccData()

  if (latestDate === undefined || latestDate.date !== parsedData[parsedData.length - 1].date) {
    if (reqType === process.env.COVID_SYMBOL) {
      await query.insertStateCovData(parsedData)
    } else {
      await query.insertStateVaccData(parsedData)
    }
  }
}

module.exports = getLatestStateData
