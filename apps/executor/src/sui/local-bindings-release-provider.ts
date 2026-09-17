import type { ReleaseProvider, WorkflowReleaseMetadata } from "../contracts.js";
import { getLocalExecutionBindings } from "../key-provider/execution-bindings-writer.js";

/**
 * Wraps a real, on-chain ReleaseProvider (SuiLicenseVerifier) and fills in
 * executionBindings from a local, trusted file instead of the chain.
 *
 * The chain's WorkflowRelease has no field for these values today — see
 * WorkflowReleaseMetadata's own doc comment — so there is nowhere on-chain
 * to read them from yet. This is deliberately a *local demo* stopgap
 * (paired with LocalDemoKeyProvider, not SealKeyProvider): the bindings
 * come from whoever ran bootstrap-release.ts for this release, the same
 * trust boundary LocalDemoKeyProvider already relies on for the DEK
 * itself. It never derives them from the downloaded bundle.
 */
export class LocalBindingsReleaseProvider implements ReleaseProvider {
  readonly #inner: ReleaseProvider;
  readonly #bindingsPath: string;

  constructor(input: { inner: ReleaseProvider; bindingsPath: string }) {
    this.#inner = input.inner;
    this.#bindingsPath = input.bindingsPath;
  }

  async getRelease(releaseId: string): Promise<WorkflowReleaseMetadata> {
    const release = await this.#inner.getRelease(releaseId);
    const executionBindings = await getLocalExecutionBindings({
      bindingsPath: this.#bindingsPath,
      releaseId,
    });
    return executionBindings === undefined
      ? release
      : { ...release, executionBindings };
  }
}
