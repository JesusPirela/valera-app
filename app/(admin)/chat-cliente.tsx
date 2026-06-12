import ChatClienteScreen from '../../components/chats/ChatClienteScreen'

export default function AdminChatCliente() {
  return (
    <ChatClienteScreen
      volverHref="/(admin)/chats"
      fichaHrefBuilder={(clienteId) => `/(admin)/detalle-cliente?id=${clienteId}`}
    />
  )
}
