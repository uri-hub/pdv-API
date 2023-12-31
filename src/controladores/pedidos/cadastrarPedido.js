const knex = require("../../conexoes/knex");
const buscarErroSeNaoEcontrado = require("../../utilitarios/servicos/buscarErroSeNaoEcontrado");
const { sendMail } = require("../../utilitarios/servicos/sendMail");

const cadastrarPedido = async (req, res) => {
    const { cliente_id, observacao, pedido_produtos } = req.body;
    try {
        if (!cliente_id || !pedido_produtos || pedido_produtos.length === 0) {
            return res.status(400).json({ mensagem: "Campos obrigatórios não preenchidos" });
        }
        await buscarErroSeNaoEcontrado("clientes", "id", cliente_id, "Cliente nao encontrado.");
        let valorTotal = 0;
        for (item of pedido_produtos) {
            const { produto_id, quantidade_produto } = item;

            const produto = await knex("produtos").where({ id: produto_id }).first();
            if (!produto) {
                return res.status(404).json({ mensagem: "Produto não encontrado" });
            }
            if (quantidade_produto > produto.quantidade_estoque)
                return res
                    .status(404)
                    .json({ message: `quantidade pedida do produto *${produto.descricao}* é menor do que em estoque` });

            valorTotal += produto.valor * quantidade_produto;

            await knex("produtos") //atualizar quantidade produtos
                .where({ id: produto_id })
                .update({
                    quantidade_estoque: produto.quantidade_estoque - quantidade_produto,
                });
        }
        const pedido = {
            cliente_id,
            observacao,
            valor_total: valorTotal,
        };
        const [pedido_id] = await knex("pedidos").insert(pedido).returning("id");
        const idPedido = pedido_id.id;

        for (const item of pedido_produtos) {
            const { produto_id, quantidade_produto } = item;
            const produto = await knex("produtos").where({ id: produto_id }).first();

            await knex("pedido_produtos").insert({
                pedido_id: idPedido,
                produto_id,
                quantidade_produto,
                valor_produto: produto.valor,
            });
        }
        const clienteEmail = await knex("clientes").select("email").where({ id: cliente_id }).first();
        const toEmail = clienteEmail.email;
        const emailBody = `
      <p>Obrigado por fazer seu pedido!</p>
      <p>Aqui estão os detalhes do seu pedido:</p>
      <ul>
        <li>Cliente ID: ${cliente_id}</li>
        <li>Observação: ${observacao}</li>
        <li>Itens do Pedido:</li>
    <ul>
      ${pedido_produtos
          .map(
              (item) => `
        <li>
          Produto ID: ${item.produto_id},
          Quantidade: ${item.quantidade_produto}
        </li>
      `
          )
          .join("")}
    </ul>
        <li>Valor Total: ${valorTotal}</li>
        
      </ul>
      <p>Seu pedido será processado em breve. Agradecemos por escolher nossa loja!</p>
    `;
        sendMail(toEmail, "Confirmação do Pedido", emailBody);
        return res.status(201).json({ mensagem: "Pedido cadastrado com sucesso" });
    } catch (error) {
        return res.status(400).json({ mensagem: error.message });
    }
};

module.exports = cadastrarPedido;
