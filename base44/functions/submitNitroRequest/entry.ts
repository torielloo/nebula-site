import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardRequest, securityResponse } from '../../shared/security.ts';

// Endpoint legado mantido somente para não quebrar clientes antigos.
// Novos comprovantes NÃO aceitam mais URL pública enviada pelo cliente.
// Todo envio deve passar por nitroReceiptSession + nitroReceiptUpload,
// que validam token temporário, tipo real do arquivo, tamanho e sanitização
// antes de armazenar o comprovante em storage privado.
export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    await guardRequest(req, base44, {
      route: 'submitNitroRequest',
      user,
      body,
      strict: true,
      limit: 6,
      windowMs: 60_000,
      maxBodyBytes: 5000,
    });

    return Response.json({
      error: 'O envio antigo de comprovante por URL foi desativado por segurança. Use o upload seguro da página Nébula Nitro.',
      code: 'secure_receipt_upload_required',
    }, {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const blocked = securityResponse(error);
    if (blocked) return blocked;
    return Response.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
  }
}
