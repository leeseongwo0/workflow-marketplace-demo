REGISTRY := local

# Resources given to the enclave by `make run` / `make run-debug`. An image that
# carries a large prebuilt binary needs more than the default: the enclave
# filesystem is RAM. Must stay within the allocator (see configure_enclave.sh).
CPU_COUNT := 2
MEMORY := 512M

.DEFAULT_GOAL :=
.PHONY: default
default: out/nitro.eif

out:
	mkdir -p out

# Context is the repo root, not this directory: aiwf-executor's Containerfile
# stage needs to see apps/executor and packages/*, which live outside
# enclave/. Dependency list covers this app's own Rust source plus whatever
# executor code and Containerfile/run.sh changes would need a fresh EIF.
DEPS := $(shell git -C .. ls-files enclave/src enclave/Containerfile enclave/configure_enclave.sh apps/executor packages/shared packages/workflow-google-news pnpm-lock.yaml pnpm-workspace.yaml | sed 's,^,../,')

# StageX's core-nodejs is built --without-npm (no npm/corepack inside the
# build container), so apps/executor is bundled into a dependency-free file
# on the host, before docker build runs, instead of inside the Containerfile.
.PHONY: bundle-aiwf-executor
bundle-aiwf-executor:
	cd .. && pnpm --filter @aiwf/executor bundle

ifeq ($(ENCLAVE_APP),aiwf-executor)
out/nitro.eif: bundle-aiwf-executor
endif

out/nitro.eif: $(DEPS) | out
	docker build \
		--pull \
		--tag $(REGISTRY)/enclaveos \
		--progress=plain \
		--platform linux/amd64 \
		--provenance=false \
		--output type=local,rewrite-timestamp=true,dest=out\
		-f Containerfile \
		--build-arg ENCLAVE_APP=$(ENCLAVE_APP) \
		..

.PHONY: run
run: out/nitro.eif
	sudo nitro-cli \
		run-enclave \
		--cpu-count $(CPU_COUNT) \
		--memory $(MEMORY) \
		--eif-path out/nitro.eif

.PHONY: run-debug
run-debug: out/nitro.eif
	sudo nitro-cli \
		run-enclave \
		--cpu-count $(CPU_COUNT) \
		--memory $(MEMORY) \
		--eif-path out/nitro.eif \
		--debug-mode \
		--attach-console

.PHONY: update
update:
	./update.sh

