const criarApp = require("./index")

const porta = Number(process.env.PORT) || 3000

criarApp(process.env.TEAMSYNC_JSON).then(app => {
    app.listen(porta, "127.0.0.1", () => {
        console.log(`TeamSync API em http://127.0.0.1:${porta}`)
    })
})
