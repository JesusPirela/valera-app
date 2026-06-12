import ChatClienteScreen from '../../components/chats/ChatClienteScreen'

export default function ProspectadorChatCliente() {
  return (
    <ChatClienteScreen
      volverHref="/(prospectador)/chats"
      fichaHrefBuilder={(clienteId) => `/(prospectador)/detalle-cliente?id=${clienteId}`}
    />
  )
}
