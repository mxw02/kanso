.PHONY: help up down logs build ps restart clean seed

help:
	@echo "Kanso - Agent-First Issue & Project Management"
	@echo ""
	@echo "Commands:"
	@echo "  make up        Start all services via Docker Compose"
	@echo "  make down      Stop all services"
	@echo "  make logs      Follow container logs"
	@echo "  make build     Rebuild all Docker containers"
	@echo "  make restart   Restart all containers"
	@echo "  make ps        Show running containers"
	@echo "  make seed      Seed database with demo data & agent tasks"
	@echo "  make clean     Remove containers, volumes, and temporary files"

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

restart:
	docker compose down && docker compose up -d

ps:
	docker compose ps

seed:
	docker compose exec api npm run prisma:seed

clean:
	docker compose down -v
