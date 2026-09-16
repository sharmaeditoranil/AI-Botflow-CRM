import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TemplateVariableMappingConfig } from '@/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/whatsapp/templates/[id]/mapping
 * Updates the template's CRM-side variable mapping without touching Meta.
 * Allows mapping {{1}}, {{2}} to contact fields (name, phone, date, custom_fields)
 * so that broadcasts and automations have pre-configured mappings.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const variableMapping = (body.variable_mapping ?? {}) as Record<
      string,
      TemplateVariableMappingConfig
    >;

    // Verify template exists in caller's account
    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id, name')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (lookupErr || !existing) {
      return NextResponse.json(
        { error: 'Template not found.' },
        { status: 404 },
      );
    }

    // Update variable_mapping
    const { data: updated, error: updateErr } = await supabase
      .from('message_templates')
      .update({
        variable_mapping: variableMapping,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to save mapping: ${updateErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      template: updated,
    });
  } catch (error) {
    console.error('Error in template mapping route:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error while saving variable mapping.',
      },
      { status: 500 },
    );
  }
}
