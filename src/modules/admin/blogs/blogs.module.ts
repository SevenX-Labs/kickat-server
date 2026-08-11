import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { BlogCategoriesController } from './blog-categories.controller';

@Module({
  controllers: [BlogsController, BlogCategoriesController],
  providers: [BlogsService],
})
export class BlogsModule {}
