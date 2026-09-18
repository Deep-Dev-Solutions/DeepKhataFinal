import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(data: any) {
    const { name, email, password } = data;

    const existinguser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existinguser) {
      throw new BadRequestException('Email Already Exist');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const NewUser = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashPassword,
      },
    });

    const accesstoken = this.jwtService.sign(
      {
        id: NewUser.id,
        name: NewUser.name,
        email: NewUser.email,
        role: NewUser.role,
        businessId: NewUser.businessId,
      },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    return { user: NewUser, accessToken: accesstoken };
  }

  async login(data: any, res: Response) {
    const { email, password } = data;

    const existinguser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!existinguser) {
      throw new BadRequestException('Email Not Found');
    }

    const isFound = await bcrypt.compare(password, existinguser.password);
    if (!isFound) {
      throw new UnauthorizedException('Invalid Password');
    }

    const accesstoken = this.jwtService.sign(
      {
        id: existinguser.id,
        name: existinguser.name,
        email: existinguser.email,
        role: existinguser.role,
        businessId: existinguser.businessId,
      },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    const refreshtoken = this.jwtService.sign(
      {
        id: existinguser.id,
      },
      {
        secret: process.env.REFRESH_TOKEN_SECRET,
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRATION || '7d') as any,
      },
    );

    res.cookie('jwt', refreshtoken, {
      httpOnly: true,
      secure: true,
    });

    return res.json({
      message: 'Login successful',
      accessToken: accesstoken,
      user: existinguser,
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  logout(res: Response) {
    res.clearCookie('jwt');
    return res.json({ message: 'Logout successful' });
  }
}
