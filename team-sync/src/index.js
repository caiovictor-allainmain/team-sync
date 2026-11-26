const express = require("express")
const path = require("path")
const dadosModulo = require("./dados")

async function criarApp(caminhoDados) {
    const caminho = caminhoDados || path.join(__dirname, "..", "teamsync.json")
    const dados = await dadosModulo.carregar(caminho)
    const app = express()

    app.use(express.json())

    function salvar() {
        return dadosModulo.gravar(caminho, dados)
    }

    function proximoId(lista) {
        return Math.max(0, ...lista.map(item => item.id || 0)) + 1
    }

    function buscar(lista, id) {
        return lista.find(item => item.id === Number(id)) || null
    }

    function validarNome(nome, mensagem) {
        if (!nome || nome.trim().length < 2) throw new Error(mensagem)
    }

    function executar(acao) {
        return async (req, res, next) => {
            try {
                await acao(req, res)
            } catch (erro) {
                erro.status = 400
                next(erro)
            }
        }
    }

    app.get("/", (req, res) => {
        res.json({ nome: "TeamSync API", status: "online" })
    })

    app.get("/usuarios", (req, res) => {
        res.json(dados.usuarios)
    })

    app.get("/usuarios/:id", (req, res) => {
        const usuario = buscar(dados.usuarios, req.params.id)
        if (!usuario) return res.status(404).json({ erro: "Usuario nao encontrado" })
        res.json(usuario)
    })

    app.post("/usuarios", executar(async (req, res) => {
        validarNome(req.body.nome, "O nome precisa ter pelo menos 2 caracteres")
        if (!req.body.email || !req.body.email.includes("@")) {
            throw new Error("Informe um email valido")
        }
        if (dados.usuarios.some(usuario => usuario.email === req.body.email.trim())) {
            throw new Error("Ja existe um usuario com este email")
        }

        const usuario = {
            id: proximoId(dados.usuarios),
            nome: req.body.nome.trim(),
            email: req.body.email.trim()
        }
        dados.usuarios.push(usuario)
        await salvar()
        res.status(201).json(usuario)
    }))

    app.put("/usuarios/:id", executar(async (req, res) => {
        const usuario = buscar(dados.usuarios, req.params.id)
        if (!usuario) return res.status(404).json({ erro: "Usuario nao encontrado" })

        const nome = req.body.nome !== undefined ? req.body.nome : usuario.nome
        const email = req.body.email !== undefined ? req.body.email : usuario.email
        validarNome(nome, "O nome precisa ter pelo menos 2 caracteres")
        if (!email || !email.includes("@")) throw new Error("Informe um email valido")
        if (dados.usuarios.some(item => item.email === email.trim() && item.id !== usuario.id)) {
            throw new Error("Ja existe um usuario com este email")
        }

        usuario.nome = nome.trim()
        usuario.email = email.trim()
        await salvar()
        res.json(usuario)
    }))

    app.delete("/usuarios/:id", executar(async (req, res) => {
        const indice = dados.usuarios.findIndex(usuario => usuario.id === Number(req.params.id))
        if (indice === -1) return res.status(404).json({ erro: "Usuario nao encontrado" })

        dados.usuarios.splice(indice, 1)
        dados.equipe_integrantes = dados.equipe_integrantes.filter(
            item => item.usuario_id !== Number(req.params.id)
        )
        dados.tarefas.forEach(tarefa => {
            if (tarefa.responsavel_id === Number(req.params.id)) tarefa.responsavel_id = null
        })
        await salvar()
        res.status(204).send()
    }))

    app.get("/equipes", (req, res) => {
        const equipes = dados.equipes.map(equipe => ({
            ...equipe,
            total_integrantes: dados.equipe_integrantes.filter(
                item => item.equipe_id === equipe.id
            ).length
        }))
        res.json(equipes)
    })

    app.get("/equipes/:id", (req, res) => {
        const equipe = buscar(dados.equipes, req.params.id)
        if (!equipe) return res.status(404).json({ erro: "Equipe nao encontrada" })

        const integrantes = dados.equipe_integrantes
            .filter(item => item.equipe_id === equipe.id)
            .map(item => buscar(dados.usuarios, item.usuario_id))
            .filter(usuario => usuario)
            .sort((a, b) => a.nome.localeCompare(b.nome))

        res.json({ ...equipe, integrantes })
    })

    app.post("/equipes", executar(async (req, res) => {
        validarNome(req.body.nome, "O nome da equipe precisa ter pelo menos 2 caracteres")
        const equipe = {
            id: proximoId(dados.equipes),
            nome: req.body.nome.trim(),
            descricao: req.body.descricao ? req.body.descricao.trim() : ""
        }
        dados.equipes.push(equipe)
        await salvar()
        res.status(201).json(equipe)
    }))

    app.put("/equipes/:id", executar(async (req, res) => {
        const equipe = buscar(dados.equipes, req.params.id)
        if (!equipe) return res.status(404).json({ erro: "Equipe nao encontrada" })
        const nome = req.body.nome !== undefined ? req.body.nome : equipe.nome
        const descricao = req.body.descricao !== undefined ? req.body.descricao : equipe.descricao
        validarNome(nome, "O nome da equipe precisa ter pelo menos 2 caracteres")
        equipe.nome = nome.trim()
        equipe.descricao = descricao ? descricao.trim() : ""
        await salvar()
        res.json(equipe)
    }))

    app.delete("/equipes/:id", executar(async (req, res) => {
        const equipeId = Number(req.params.id)
        const indice = dados.equipes.findIndex(equipe => equipe.id === equipeId)
        if (indice === -1) return res.status(404).json({ erro: "Equipe nao encontrada" })

        dados.equipes.splice(indice, 1)
        dados.equipe_integrantes = dados.equipe_integrantes.filter(
            item => item.equipe_id !== equipeId
        )
        const projetoIds = dados.projetos
            .filter(projeto => projeto.equipe_id === equipeId)
            .map(projeto => projeto.id)
        dados.projetos = dados.projetos.filter(projeto => projeto.equipe_id !== equipeId)
        dados.tarefas = dados.tarefas.filter(tarefa => !projetoIds.includes(tarefa.projeto_id))
        await salvar()
        res.status(204).send()
    }))

    app.post("/equipes/:id/integrantes", executar(async (req, res) => {
        const equipeId = Number(req.params.id)
        const usuarioId = Number(req.body.usuario_id)
        if (!buscar(dados.equipes, equipeId)) throw new Error("Equipe nao encontrada")
        if (!buscar(dados.usuarios, usuarioId)) throw new Error("Usuario nao encontrado")
        if (dados.equipe_integrantes.some(item =>
            item.equipe_id === equipeId && item.usuario_id === usuarioId
        )) throw new Error("Usuario ja faz parte da equipe")

        dados.equipe_integrantes.push({ equipe_id: equipeId, usuario_id: usuarioId })
        await salvar()
        res.status(201).json(buscar(dados.usuarios, usuarioId))
    }))

    app.delete("/equipes/:id/integrantes/:usuarioId", executar(async (req, res) => {
        const antes = dados.equipe_integrantes.length
        dados.equipe_integrantes = dados.equipe_integrantes.filter(item =>
            item.equipe_id !== Number(req.params.id) ||
            item.usuario_id !== Number(req.params.usuarioId)
        )
        if (dados.equipe_integrantes.length === antes) {
            return res.status(404).json({ erro: "Integrante nao encontrado na equipe" })
        }
        await salvar()
        res.status(204).send()
    }))

    app.get("/projetos", (req, res) => {
        res.json(dados.projetos)
    })

    app.get("/projetos/:id", (req, res) => {
        const projeto = buscar(dados.projetos, req.params.id)
        if (!projeto) return res.status(404).json({ erro: "Projeto nao encontrado" })
        res.json(projeto)
    })

    function validarProjeto(dadosProjeto) {
        if (!dadosProjeto.equipe_id) throw new Error("Informe o id da equipe")
        validarNome(dadosProjeto.nome, "O nome do projeto precisa ter pelo menos 2 caracteres")
        if (!["planejado", "em andamento", "concluido"].includes(dadosProjeto.status || "planejado")) {
            throw new Error("Status do projeto invalido")
        }
        if (!buscar(dados.equipes, dadosProjeto.equipe_id)) {
            throw new Error("Equipe nao encontrada")
        }
        if (dadosProjeto.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(dadosProjeto.prazo)) {
            throw new Error("Prazo invalido; use o formato AAAA-MM-DD")
        }
    }

    app.post("/projetos", executar(async (req, res) => {
        const dadosProjeto = {
            id: proximoId(dados.projetos),
            equipe_id: Number(req.body.equipe_id),
            nome: req.body.nome,
            descricao: req.body.descricao || "",
            prazo: req.body.prazo || null,
            status: req.body.status || "planejado"
        }
        validarProjeto(dadosProjeto)
        dadosProjeto.nome = dadosProjeto.nome.trim()
        dadosProjeto.descricao = dadosProjeto.descricao.trim()
        dados.projetos.push(dadosProjeto)
        await salvar()
        res.status(201).json(dadosProjeto)
    }))

    app.put("/projetos/:id", executar(async (req, res) => {
        const projeto = buscar(dados.projetos, req.params.id)
        if (!projeto) return res.status(404).json({ erro: "Projeto nao encontrado" })
        const alterado = { ...projeto, ...req.body, id: projeto.id, equipe_id: Number(req.body.equipe_id || projeto.equipe_id) }
        validarProjeto(alterado)
        alterado.nome = alterado.nome.trim()
        alterado.descricao = alterado.descricao ? alterado.descricao.trim() : ""
        Object.assign(projeto, alterado)
        await salvar()
        res.json(projeto)
    }))

    app.delete("/projetos/:id", executar(async (req, res) => {
        const indice = dados.projetos.findIndex(projeto => projeto.id === Number(req.params.id))
        if (indice === -1) return res.status(404).json({ erro: "Projeto nao encontrado" })
        dados.projetos.splice(indice, 1)
        dados.tarefas = dados.tarefas.filter(
            tarefa => tarefa.projeto_id !== Number(req.params.id)
        )
        await salvar()
        res.status(204).send()
    }))

    app.get("/projetos/:id/progresso", (req, res) => {
        const projeto = buscar(dados.projetos, req.params.id)
        if (!projeto) return res.status(404).json({ erro: "Projeto nao encontrado" })
        const tarefas = dados.tarefas.filter(tarefa => tarefa.projeto_id === projeto.id)
        const concluidas = tarefas.filter(tarefa => tarefa.status === "concluida").length
        res.json({
            projeto: projeto.nome,
            total: tarefas.length,
            concluidas,
            pendentes: tarefas.length - concluidas,
            porcentagem: tarefas.length ? Math.round(concluidas / tarefas.length * 100) : 0
        })
    })

    app.get("/tarefas", (req, res) => {
        const tarefas = dados.tarefas.filter(tarefa =>
            (!req.query.projeto_id || tarefa.projeto_id === Number(req.query.projeto_id)) &&
            (!req.query.status || tarefa.status === req.query.status) &&
            (!req.query.responsavel_id || tarefa.responsavel_id === Number(req.query.responsavel_id))
        )
        res.json(tarefas)
    })

    app.get("/tarefas/:id", (req, res) => {
        const tarefa = buscar(dados.tarefas, req.params.id)
        if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" })
        res.json(tarefa)
    })

    function validarTarefa(dadosTarefa) {
        if (!dadosTarefa.projeto_id) throw new Error("Informe o id do projeto")
        validarNome(dadosTarefa.titulo, "O titulo da tarefa precisa ter pelo menos 2 caracteres")
        if (!["baixa", "media", "alta"].includes(dadosTarefa.prioridade || "media")) {
            throw new Error("Prioridade invalida")
        }
        if (!["pendente", "em andamento", "concluida"].includes(dadosTarefa.status || "pendente")) {
            throw new Error("Status da tarefa invalido")
        }
        if (dadosTarefa.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(dadosTarefa.prazo)) {
            throw new Error("Prazo invalido; use o formato AAAA-MM-DD")
        }
        const projeto = buscar(dados.projetos, dadosTarefa.projeto_id)
        if (!projeto) throw new Error("Projeto nao encontrado")
        if (dadosTarefa.responsavel_id && !dados.equipe_integrantes.some(item =>
            item.equipe_id === projeto.equipe_id &&
            item.usuario_id === dadosTarefa.responsavel_id
        )) throw new Error("Responsavel nao pertence a equipe do projeto")
    }

    app.post("/tarefas", executar(async (req, res) => {
        const dadosTarefa = {
            id: proximoId(dados.tarefas),
            projeto_id: Number(req.body.projeto_id),
            responsavel_id: req.body.responsavel_id ? Number(req.body.responsavel_id) : null,
            titulo: req.body.titulo,
            descricao: req.body.descricao || "",
            prioridade: req.body.prioridade || "media",
            prazo: req.body.prazo || null,
            status: req.body.status || "pendente"
        }
        validarTarefa(dadosTarefa)
        dadosTarefa.titulo = dadosTarefa.titulo.trim()
        dadosTarefa.descricao = dadosTarefa.descricao.trim()
        dados.tarefas.push(dadosTarefa)
        await salvar()
        res.status(201).json(dadosTarefa)
    }))

    app.put("/tarefas/:id", executar(async (req, res) => {
        const tarefa = buscar(dados.tarefas, req.params.id)
        if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" })
        const alterada = {
            ...tarefa,
            ...req.body,
            id: tarefa.id,
            projeto_id: Number(req.body.projeto_id || tarefa.projeto_id),
            responsavel_id: req.body.responsavel_id === null
                ? null
                : req.body.responsavel_id
                    ? Number(req.body.responsavel_id)
                    : tarefa.responsavel_id
        }
        validarTarefa(alterada)
        alterada.titulo = alterada.titulo.trim()
        alterada.descricao = alterada.descricao ? alterada.descricao.trim() : ""
        Object.assign(tarefa, alterada)
        await salvar()
        res.json(tarefa)
    }))

    app.delete("/tarefas/:id", executar(async (req, res) => {
        const indice = dados.tarefas.findIndex(tarefa => tarefa.id === Number(req.params.id))
        if (indice === -1) return res.status(404).json({ erro: "Tarefa nao encontrada" })
        dados.tarefas.splice(indice, 1)
        await salvar()
        res.status(204).send()
    }))

    app.use((req, res) => {
        res.status(404).json({ erro: "Rota nao encontrada" })
    })

    app.use((erro, req, res, next) => {
        res.status(erro.status || 500).json({ erro: erro.message })
    })

    return app
}

module.exports = criarApp
