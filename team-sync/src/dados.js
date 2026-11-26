const fs = require("fs/promises")

const dadosIniciais = {
    usuarios: [],
    equipes: [],
    equipe_integrantes: [],
    projetos: [],
    tarefas: []
}

async function carregar(caminho) {
    try {
        const conteudo = await fs.readFile(caminho, "utf-8")
        return JSON.parse(conteudo)
    } catch (erro) {
        await fs.writeFile(caminho, JSON.stringify(dadosIniciais, null, 2), "utf-8")
        return JSON.parse(JSON.stringify(dadosIniciais))
    }
}

async function gravar(caminho, dados) {
    await fs.writeFile(caminho, JSON.stringify(dados, null, 2), "utf-8")
}

async function limpar(caminho) {
    try {
        await fs.unlink(caminho)
        return true
    } catch (erro) {
        return false
    }
}

module.exports = { carregar, gravar, limpar }
